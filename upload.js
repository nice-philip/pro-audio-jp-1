const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const Album = require('./models/Album');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// ✅ S3 설정
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// ✅ Multer 메모리 저장소 설정
const storage = multer.memoryStorage();

const upload = multer({ 
    storage,
    fileFilter: function (req, file, cb) {
        console.log('✅ File upload attempt:', file.fieldname, file.originalname);
        if (file.fieldname === 'image') {
            if (!file.originalname.match(/\.(jpg|jpeg)$/)) {
                return cb(new Error('JPG 形式の画像のみアップロード可能です。'), false);
            }
        } else if (file.fieldname === 'audio') {
            if (!file.originalname.match(/\.(wav)$/)) {
                return cb(new Error('WAV 形式の音声ファイルのみアップロード可能です。'), false);
            }
        }
        cb(null, true);
    },
    limits: {
        fileSize: 300 * 1024 * 1024 // 300MB 제한
    }
});

// ✅ 중국어 날짜 형식 처리 함수
function parseChineseDate(dateStr) {
    // ISO 형식 확인 (예: "2024-03-21T00:00:00.000Z")
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}T/)) {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            throw new Error('Invalid ISO date format');
        }
        return date;
    }

    // 중국어/일본어 형식 처리
    const matches = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!matches) {
        throw new Error(`Invalid date format: ${dateStr}. Expected: YYYY年MM月DD日 or ISO format`);
    }
    const [, yearStr, monthStr, dayStr] = matches;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    // 날짜 유효성 검사
    if (isNaN(year) || year < 1900 || year > 2100) {
        throw new Error(`Invalid year: ${year}. Must be between 1900 and 2100`);
    }
    if (isNaN(month) || month < 1 || month > 12) {
        throw new Error(`Invalid month: ${month}. Must be between 1 and 12`);
    }
    if (isNaN(day) || day < 1 || day > 31) {
        throw new Error(`Invalid day: ${day}. Must be between 1 and 31`);
    }

    // 월별 일수 검사
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) {
        throw new Error(`Invalid day: ${day}. ${month} month has ${daysInMonth} days`);
    }

    return new Date(year, month - 1, day);
}

// ✅ 오디오와 이미지 업로드 처리 라우터
router.post('/', upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'image', maxCount: 1 }
]), async(req, res) => {
    console.log('Upload route accessed');
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);

    try {
        if (!req.files || !req.files.audio) {
            console.log('❌ No audio file uploaded');
            return res.status(400).json({ 
                message: '音声ファイルが必要です',
                code: 'FILE_REQUIRED' 
            });
        }

        // 필수 필드 검증
        const requiredFields = [
            'albumTitle', 'nameEn', 'nameKana', 'artistInfo',
            'songTitle', 'songTitleEn', 'date', 'time', 'genre'
        ];

        const missingFields = requiredFields.filter(field => !req.body[field]);
        if (missingFields.length > 0) {
            console.log('❌ Missing required fields:', missingFields);
            return res.status(400).json({
                message: '必須項目が不足しています',
                fields: missingFields,
                code: 'MISSING_FIELDS'
            });
        }

        // 날짜 파싱
        let parsedDate;
        try {
            parsedDate = parseChineseDate(req.body.date);
            console.log('✅ Date parsed successfully:', parsedDate.toISOString());
        } catch (e) {
            console.error('❌ Date parsing failed:', e.message);
            return res.status(400).json({
                message: '日付フォーマットが正しくありません',
                error: e.message,
                code: 'DATE_PARSE_ERROR'
            });
        }

        // S3 업로드 - 오디오 파일
        const audioFile = req.files.audio[0];
        const audioFilename = `${uuidv4()}_${audioFile.originalname}`;
        const audioUploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${audioFilename}`,
            Body: audioFile.buffer,
            ContentType: audioFile.mimetype,
        };

        console.log('Attempting S3 upload for audio:', audioFilename);
        let audioUrl;
        try {
            await s3Client.send(new PutObjectCommand(audioUploadParams));
            console.log('✅ S3 audio upload success');
            audioUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/audio/${audioFilename}`;
        } catch (error) {
            console.error('❌ S3 audio upload failed:', error);
            throw error;
        }

        // S3 업로드 - 이미지 파일
        let imageUrl;
        if (req.files.image) {
            const imageFile = req.files.image[0];
            const imageFilename = `${uuidv4()}_${imageFile.originalname}`;
            const imageUploadParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `images/${imageFilename}`,
                Body: imageFile.buffer,
                ContentType: imageFile.mimetype,
            };

            try {
                await s3Client.send(new PutObjectCommand(imageUploadParams));
                console.log('✅ S3 image upload success');
                imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/images/${imageFilename}`;
            } catch (error) {
                console.error('❌ S3 image upload failed:', error);
                throw error;
            }
        }

        // MongoDB 저장
        const newAlbum = new Album({
            albumTitle: req.body.albumTitle,
            nameEn: req.body.nameEn,
            nameKana: req.body.nameKana,
            artistInfo: req.body.artistInfo,
            isReleased: req.body.isReleased === 'true',
            imageUrl,
            genre: req.body.genre,
            youtubeMonetize: req.body.youtubeMonetize,
            youtubeAgree: req.body.youtubeAgree === 'true',
            songs: [{
                title: req.body.songTitle,
                titleEn: req.body.songTitleEn,
                date: parsedDate,
                duration: req.body.time,
                audioUrl,
                isClassical: req.body.isClassical === 'true',
                classicalInfo: {
                    composer: req.body.composer || '',
                    opusNumber: req.body.opusNumber || '',
                    movement: req.body.movement || '',
                    tempo: req.body.tempo || ''
                }
            }],
            status: '処理中'
        });

        console.log('Attempting to save to MongoDB:', newAlbum);
        await newAlbum.save();
        console.log('✅ MongoDB save success:', newAlbum._id);

        res.status(200).json({ 
            message: '保存完了',
            albumId: newAlbum._id,
            audioUrl,
            imageUrl 
        });

    } catch (err) {
        console.error('❌ Upload process error:', err);
        res.status(500).json({ 
            message: '予約作成に失敗しました', 
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// ✅ 예약 삭제 라우터 (S3 파일도 함께 삭제)
router.delete('/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) {
            return res.status(404).json({ message: '予約が見つかりません' });
        }

        // S3 오디오 파일 삭제
        if (album.audioUrl) {
            const key = album.audioUrl.split('/').pop();
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `audio/${key}`
            };
            await s3Client.send(new DeleteObjectCommand(deleteParams));
            console.log('✅ S3ファイルを削除しました:', key);
        }

        await Album.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: '予約を削除しました' });
    } catch (err) {
        console.error('❌ 削除に失敗:', err);
        res.status(500).json({ message: '削除に失敗しました', error: err.message });
    }
});

// ✅ 다운로드 라우터
router.get('/download/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album || !album.audioUrl) {
            return res.status(404).json({ message: 'ファイルが存在しません' });
        }

        const key = decodeURIComponent(album.audioUrl.split('/').slice(-1)[0]);
        const filename = key.split('_').slice(1).join('_');

        const getObjectParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${key}`,
        };

        const { Body } = await s3Client.send(new GetObjectCommand(getObjectParams));

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'audio/mpeg');
        Body.pipe(res);

        Body.on('error', (err) => {
            console.error('❌ S3ストリーミングに失敗:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: 'ダウンロードに失敗しました', error: err.message });
            }
        });
    } catch (err) {
        console.error('❌ ダウンロードに失敗:', err);
        res.status(500).json({ message: 'ダウンロードに失敗しました', error: err.message });
    }
});

module.exports = router;
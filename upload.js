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
        fileSize: 100 * 1024 * 1024 // 100MB 제한으로 수정
    }
});

// ✅ 중국어 날짜 형식 처리 함수
function parseChineseDate(dateStr) {
    const match = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!match) {
        throw new Error('日付フォーマットが正しくありません (例: 2024年3月15日)');
    }
    const [_, year, month, day] = match;
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
        if (!req.files || !req.files.audio || !req.files.image) {
            console.log('❌ Required files missing');
            return res.status(400).json({ 
                message: '音声ファイルとジャケット画像が必要です',
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
                message: '必須項目が不足しています: ' + missingFields.join(', '),
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
                message: e.message,
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
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const Album = require('./models/Album');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');

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
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.fieldname === 'albumCover') {
            if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
                return cb(new Error('JPG/PNG 形式の画像のみアップロード可能です。'), false);
            }
        } else if (file.fieldname === 'audioFiles') {
            if (!file.originalname.match(/\.(wav)$/)) {
                return cb(new Error('WAV 形式の音声ファイルのみアップロード可能です。'), false);
            }
        }
        cb(null, true);
    },
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 50 // 최대 파일 수
    }
});

// ✅ 이미지 검증 함수
async function validateImage(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        if (metadata.width !== 3000 || metadata.height !== 3000) {
            throw new Error('アルバムカバーは3000x3000ピクセルである必要があります。');
        }
        if (buffer.length > 10 * 1024 * 1024) {
            throw new Error('アルバムカバーは10MB以下である必要があります。');
        }
        return true;
    } catch (error) {
        throw error;
    }
}

// ✅ S3 업로드 함수
async function uploadToS3(file, folder) {
    const filename = `${uuidv4()}_${file.originalname}`;
    const uploadParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${folder}/${filename}`,
        Body: file.buffer,
        ContentType: file.mimetype
    };

    try {
        await s3Client.send(new PutObjectCommand(uploadParams));
        return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${folder}/${filename}`;
    } catch (error) {
        console.error(`❌ S3 upload failed for ${filename}:`, error);
        throw error;
    }
}

// ✅ 앨범 업로드 처리 라우터
router.post('/', upload.fields([
    { name: 'albumCover', maxCount: 1 },
    { name: 'audioFiles', maxCount: 10 }
]), async (req, res) => {
    console.log('Upload request received');
    
    try {
        // 필수 필드 검증
        if (!req.body || !req.files) {
            return res.status(400).json({
                success: false,
                message: 'ファイルまたはフォームデータが不足しています'
            });
        }

        // 앨범 커버 검증
        if (!req.files.albumCover || !req.files.albumCover[0]) {
            return res.status(400).json({
                success: false,
                message: 'アルバムカバーが必要です'
            });
        }

        // 오디오 파일 검증
        if (!req.files.audioFiles || req.files.audioFiles.length === 0) {
            return res.status(400).json({
                success: false,
                message: '少なくとも1つの音声ファイルが必要です'
            });
        }

        // 파일 업로드 처리
        const albumCoverFile = req.files.albumCover[0];
        const audioFiles = req.files.audioFiles;

        // 앨범 커버 S3 업로드
        const coverKey = `covers/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(albumCoverFile.originalname)}`;
        await s3Client.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: coverKey,
            Body: albumCoverFile.buffer,
            ContentType: albumCoverFile.mimetype
        }));

        // 오디오 파일 S3 업로드
        const uploadedSongs = await Promise.all(audioFiles.map(async (file, index) => {
            const audioKey = `audio/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: audioKey,
                Body: file.buffer,
                ContentType: file.mimetype
            }));

            // 노래 정보 구성
            return {
                mainArtist: req.body[`mainArtist_${index}`]?.split(',') || [],
                participatingArtist: req.body[`participatingArtist_${index}`]?.split(',') || [],
                featuring: req.body[`featuring_${index}`]?.split(',') || [],
                mixingEngineer: req.body[`mixingEngineer_${index}`]?.split(',') || [],
                recordingEngineer: req.body[`recordingEngineer_${index}`]?.split(',') || [],
                producer: req.body[`producer_${index}`]?.split(',') || [],
                lyricist: req.body[`lyricist_${index}`]?.split(',') || [],
                composer: req.body[`composer_${index}`]?.split(',') || [],
                arranger: req.body[`arranger_${index}`]?.split(',') || [],
                audioUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${audioKey}`,
                isRemake: req.body[`isRemake_${index}`] || 'no',
                usesExternalBeat: req.body[`usesExternalBeat_${index}`] || 'no',
                language: req.body[`language_${index}`] || 'japanese',
                lyrics: req.body[`lyrics_${index}`] || '',
                hasExplicitContent: req.body[`hasExplicitContent_${index}`] === 'true'
            };
        }));

        // 앨범 데이터 생성
        const albumData = {
            releaseDate: req.body.releaseDate,
            email: req.body.email,
            password: req.body.password,
            albumNameDomestic: req.body.albumNameDomestic,
            albumNameInternational: req.body.albumNameInternational,
            artistNameKana: req.body.artistNameKana,
            artistNameEnglish: req.body.artistNameEnglish,
            versionInfo: req.body.versionInfo,
            songs: uploadedSongs,
            albumCover: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${coverKey}`,
            platforms: req.body.platforms ? JSON.parse(req.body.platforms) : [],
            excludedCountries: req.body.excludedCountries ? JSON.parse(req.body.excludedCountries) : [],
            genre: req.body.genre,
            youtubeMonetize: req.body.youtubeMonetize === 'on' ? 'yes' : 'no',
            youtubeAgree: req.body.youtubeAgree === 'true',
            rightsAgreement: req.body.rightsAgreement === 'true',
            reReleaseAgreement: req.body.reReleaseAgreement === 'true',
            platformAgreement: req.body.platformAgreement === 'true',
            paymentStatus: 'completed'
        };

        // MongoDB에 앨범 저장
        const album = new Album(albumData);
        await album.save();

        // 성공 응답
        res.status(200).json({
            success: true,
            message: 'アルバムが正常に登録されました',
            albumId: album._id
        });

    } catch (error) {
        console.error('Upload error:', error);
        
        // 구체적인 에러 메시지 반환
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: '入力データが無効です',
                error: error.message
            });
        }
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: '重複したデータが存在します',
                error: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'アップロードに失敗しました',
            error: error.message
        });
    }
});

// ✅ 앨범 삭제 라우터
router.delete('/:id', async (req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) {
            return res.status(404).json({ message: 'アルバムが見つかりません' });
        }

        // S3에서 앨범 커버 삭제
        if (album.albumCover) {
            const coverKey = album.albumCover.split('/').pop();
            await s3Client.send(new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `covers/${coverKey}`
            }));
        }

        // S3에서 모든 곡 파일 삭제
        for (const song of album.songs) {
            if (song.audioUrl) {
                const audioKey = song.audioUrl.split('/').pop();
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `audio/${audioKey}`
                }));
            }
        }

        await Album.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'アルバムを削除しました' });
    } catch (error) {
        console.error('❌ Delete process error:', error);
        res.status(500).json({
            message: 'アルバムの削除に失敗しました',
            error: error.message
        });
    }
});

module.exports = router;
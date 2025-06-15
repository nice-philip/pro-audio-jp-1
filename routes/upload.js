const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Album = require('./models/Album');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

// MongoDB 연결 확인
mongoose.connection.on('connected', () => {
    console.log('MongoDB connected successfully in upload.js');
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error in upload.js:', err);
});

// S3 설정
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Multer 메모리 저장소 설정
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    fileFilter: function(req, file, cb) {
        if (file.fieldname === 'albumCover') {
            if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
                return cb(new Error('JPG/PNG 形式の画像のみアップロード可能です。'), false);
            }
            // 이미지 파일 크기 제한 (10MB)
            if (file.size > 10 * 1024 * 1024) {
                return cb(new Error('画像ファイルは10MB以下にしてください。'), false);
            }
        } else if (file.fieldname === 'audioFiles') {
            if (!file.originalname.match(/\.(wav)$/)) {
                return cb(new Error('WAV 形式の音声ファイルのみアップロード可能です。'), false);
            }
            // 오디오 파일 크기 제한 (50MB)
            if (file.size > 50 * 1024 * 1024) {
                return cb(new Error('音声ファイルは50MB以下にしてください。'), false);
            }
        }
        cb(null, true);
    },
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 10
    }
});

// S3 업로드 함수
const uploadToS3 = async (file, key) => {
    try {
        await s3Client.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype
        }));
        return true;
    } catch (error) {
        console.error('S3 upload error:', error);
        throw new Error('ファイルのアップロードに失敗しました。');
    }
};

// Helper function to parse array fields
const parseArrayField = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            return value.split(',').map(v => v.trim());
        }
    }
    return [value];
};

// 앨범 업로드 처리 라우터
router.post('/', upload.fields([
    { name: 'albumCover', maxCount: 1 },
    { name: 'audioFiles', maxCount: 10 }
]), async(req, res) => {
    console.log('Upload request received');
    console.log('Request body:', req.body);

    // 필수 필드 검증
    const requiredFields = {
      artistNameKana: req.body.artistNameKana,
      artistNameEnglish: req.body.artistNameEnglish,
      versionInfo: req.body.versionInfo
    };

    console.log('Required fields:', requiredFields);

    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value || value.trim() === '')
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    try {
        if (!req.body || !req.files) {
            return res.status(400).json({ success: false, message: 'ファイルまたはフォームデータが不足しています' });
        }

        if (!req.files.albumCover || !req.files.albumCover[0]) {
            return res.status(400).json({ success: false, message: 'アルバムカバーが必要です' });
        }

        if (!req.files.audioFiles || req.files.audioFiles.length === 0) {
            return res.status(400).json({ success: false, message: '少なくとも1つの音声ファイルが必要です' });
        }

        const albumCoverFile = req.files.albumCover[0];
        const audioFiles = req.files.audioFiles;

        // 앨범 커버 업로드
        const coverKey = `covers/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(albumCoverFile.originalname)}`;
        await uploadToS3(albumCoverFile, coverKey);

        // 오디오 파일 업로드 및 곡 정보 매핑
        const uploadedSongs = await Promise.all(audioFiles.map(async(file, index) => {
            const audioKey = `audio/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
            await uploadToS3(file, audioKey);

            // Get duration values and ensure they are numbers
            const minutes = parseInt(req.body[`duration_min_${index}`]) || 0;
            const seconds = parseInt(req.body[`duration_sec_${index}`]) || 0;

            // Validate duration values
            if (minutes < 0 || seconds < 0 || seconds > 59) {
                throw new Error('Invalid duration values');
            }

            return {
                title: req.body[`title_${index}`] || '',
                titleEn: req.body[`titleEn_${index}`] || '',
                duration: {
                    minutes: minutes,
                    seconds: seconds
                },
                genre: req.body[`genre_${index}`] || '',
                mainArtist: parseArrayField(req.body[`mainArtist_${index}`]),
                participatingArtist: parseArrayField(req.body[`participatingArtist_${index}`]),
                featuring: parseArrayField(req.body[`featuring_${index}`]),
                mixingEngineer: parseArrayField(req.body[`mixingEngineer_${index}`]),
                recordingEngineer: parseArrayField(req.body[`recordingEngineer_${index}`]),
                producer: parseArrayField(req.body[`producer_${index}`]),
                lyricist: parseArrayField(req.body[`lyricist_${index}`]),
                composer: parseArrayField(req.body[`composer_${index}`]),
                arranger: parseArrayField(req.body[`arranger_${index}`]),
                audioUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${audioKey}`,
                isRemake: req.body[`isRemake_${index}`] === 'yes',
                usesExternalBeat: req.body[`usesExternalBeat_${index}`] === 'yes',
                language: req.body[`language_${index}`] || 'instrumental',
                lyrics: req.body[`lyrics_${index}`] || '',
                hasExplicitContent: req.body[`hasExplicitContent_${index}`] === 'true'
            };
        }));

        // Create album data
        const albumData = {
            artistNameKana: requiredFields.artistNameKana,
            artistNameEnglish: requiredFields.artistNameEnglish,
            versionInfo: requiredFields.versionInfo,
            releaseDate: new Date(req.body.releaseDate),
            email: req.body.email,
            password: req.body.password,
            albumNameDomestic: req.body.albumNameDomestic,
            albumNameInternational: req.body.albumNameInternational,
            songs: uploadedSongs,
            albumCover: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${coverKey}`,
            platforms: parseArrayField(req.body.platforms),
            excludedCountries: parseArrayField(req.body.excludedCountries),
            rightsAgreement: req.body.rightsAgreement === 'true',
            reReleaseAgreement: req.body.reReleaseAgreement === 'true',
            platformAgreement: req.body.platformAgreement === 'true',
            paymentStatus: 'pending',
            paymentAmount: 20000,
            payLater: req.body.payLater === 'true'
        };

        const album = new Album(albumData);
        await album.save();

        res.status(200).json({
            success: true,
            message: 'アルバムが正常に登録されました',
            albumId: album._id
        });

    } catch (error) {
        console.error('Upload error:', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: '入力データが無効です',
                errors: Object.values(error.errors).map(err => err.message)
            });
        }

        res.status(500).json({
            success: false,
            message: 'サーバーエラーが発生しました',
            error: error.message
        });
    }
});

module.exports = router;
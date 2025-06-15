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
        } else if (file.fieldname === 'audioFiles') {
            if (!file.originalname.match(/\.(wav)$/)) {
                return cb(new Error('WAV 形式の音声ファイルのみアップロード可能です。'), false);
            }
        }
        cb(null, true);
    },
    limits: {
        fileSize: 100 * 1024 * 1024,
        files: 50
    }
});

// 앨범 업로드 처리 라우터
router.post('/', upload.fields([
    { name: 'albumCover', maxCount: 1 },
    { name: 'audioFiles', maxCount: 10 }
]), async(req, res) => {
    console.log('Upload request received');

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

        const coverKey = `covers/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(albumCoverFile.originalname)}`;
        await s3Client.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: coverKey,
            Body: albumCoverFile.buffer,
            ContentType: albumCoverFile.mimetype
        }));

        const uploadedSongs = await Promise.all(audioFiles.map(async(file, index) => {
            const audioKey = `audio/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: audioKey,
                Body: file.buffer,
                ContentType: file.mimetype
            }));

            const getArray = (field) => Array.isArray(field) ? field : (field ? [field] : []);

            return {
                songNameJapanese: req.body[`songNameJapanese_${index}`],
                songNameEnglish: req.body[`songNameEnglish_${index}`],
                genre: req.body[`genre_${index}`],
                mainArtist: getArray(req.body[`mainArtist_${index}[]`]),
                participatingArtist: getArray(req.body[`participatingArtist_${index}[]`]),
                featuring: getArray(req.body[`featuring_${index}[]`]),
                mixingEngineer: getArray(req.body[`mixingEngineer_${index}[]`]),
                recordingEngineer: getArray(req.body[`recordingEngineer_${index}[]`]),
                producer: getArray(req.body[`producer_${index}[]`]),
                lyricist: getArray(req.body[`lyricist_${index}[]`]),
                composer: getArray(req.body[`composer_${index}[]`]),
                arranger: getArray(req.body[`arranger_${index}[]`]),
                audioUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${audioKey}`,
                isRemake: req.body[`isRemake_${index}`],
                usesExternalBeat: req.body[`usesExternalBeat_${index}`],
                language: req.body[`language_${index}`],
                lyrics: req.body[`lyrics_${index}`] || '',
                hasExplicitContent: req.body[`hasExplicitContent_${index}`] === 'true'
            };
        }));

        const parseArrayField = (value) => {
            if (!value) return [];
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) return parsed;
                return [parsed];
            } catch {
                return value.split(',').map(v => v.trim());
            }
        };

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
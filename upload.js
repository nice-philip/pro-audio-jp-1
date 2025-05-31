const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const Album = require('./models/Album');
const router = express.Router();
const path = require('path');

// AWS S3 설정
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// multer 설정
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 업로드 API
router.post('/', upload.single('audio'), async(req, res) => {
    try {
        const {
            name,
            age,
            gender,
            email,
            date,
            time,
            mainRequest,
            note,
            memberKey
        } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: '오디오 파일이 없습니다.' });
        }

        const fileExtension = path.extname(req.file.originalname);
        const filename = `${uuidv4()}${fileExtension}`;
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: filename,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        };

        const command = new PutObjectCommand(uploadParams);
        await s3Client.send(command);

        // ✅ audioUrl 직접 구성
        const audioUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;
        console.log("✅ 생성된 audioUrl:", audioUrl);

        const album = new Album({
            name,
            age,
            gender,
            email,
            date,
            time,
            mainRequest,
            note,
            memberKey,
            audioUrl // 필수 필드
        });

        await album.save();

        res.status(200).json({ message: '업로드 및 저장 성공', album });
    } catch (err) {
        console.error('❌ 예약 생성 실패:', err);
        res.status(500).json({
            message: '예약 생성 실패',
            error: err.message,
            stack: err.stack // 디버깅 후 제거해도 됩니다
        });
    }
});

module.exports = router;
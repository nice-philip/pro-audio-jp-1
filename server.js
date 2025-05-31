const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const uploadRoutes = require('./upload');
const Album = require('./models/Album');

const app = express();
const port = process.env.PORT || 8080;

// AWS S3 설정
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// CORS 설정
app.use(cors({
    origin: 'https://cheery-bienenstitch-8bad49.netlify.app',
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// JSON 파싱 허용
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 제공
app.use(express.static(__dirname));
app.use(express.static('public'));

// Multer 설정
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB 제한
        files: 1 // 단일 파일만 허용
    }
});

// 업로드 라우터 연결
app.use('/api/upload', uploadRoutes);

// 예약 조회 API
app.get('/api/reservations', async(req, res) => {
    const key = req.query.key;

    if (!key) {
        return res.status(400).json({ message: '예약번호가 필요합니다.' });
    }

    try {
        if (key === 'admin25') {
            const all = await Album.find().sort({ createdAt: -1 });
            return res.status(200).json(all);
        } else {
            const userReservations = await Album.find({ reservationCode: key }).sort({ createdAt: -1 });
            if (userReservations.length === 0) {
                return res.status(404).json({ message: '예약 정보를 찾을 수 없습니다.' });
            }
            return res.status(200).json(userReservations);
        }
    } catch (err) {
        console.error('❌ 예약 조회 실패:', err);
        return res.status(500).json({ message: '조회 실패', error: err.message });
    }
});

// 예약 생성 API
app.post('/api/reservations', upload.single('audio'), async(req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: '오디오 파일이 필요합니다.' });
        }

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

        // 필수 필드 검증
        if (!name || !age || !gender || !email || !date || !time || !memberKey) {
            return res.status(400).json({ message: '모든 필수 항목을 입력해주세요.' });
        }

        // S3에 파일 업로드
        const filename = `${Date.now()}_${req.file.originalname}`;
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${filename}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        };

        const uploadResult = await s3Client.send(new PutObjectCommand(uploadParams));

        // DB에 예약 정보 저장
        const newAlbum = new Album({
            name,
            age: Number(age),
            gender,
            email,
            date: new Date(date),
            albumLength: time,
            albumDescription: mainRequest,
            note,
            reservationCode: memberKey,
            audioUrl: uploadResult.Location,
            status: '처리중'
        });

        await newAlbum.save();
        res.status(200).json({ 
            message: '예약이 완료되었습니다.',
            reservationCode: memberKey,
            audioUrl: uploadResult.Location 
        });
    } catch (err) {
        console.error('❌ 예약 생성 실패:', err);
        res.status(500).json({ message: '예약 생성 실패', error: err.message });
    }
});

// 예약 삭제 API
app.delete('/api/reservations/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) {
            return res.status(404).json({ message: '예약을 찾을 수 없습니다.' });
        }

        // S3에서 파일 삭제
        if (album.audioUrl) {
            const key = album.audioUrl.split('/').pop();
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `audio/${key}`
            };

            await s3Client.send(new DeleteObjectCommand(deleteParams));
        }

        await Album.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: '예약이 삭제되었습니다.' });
    } catch (err) {
        console.error('❌ 예약 삭제 실패:', err);
        res.status(500).json({ message: '예약 삭제 실패', error: err.message });
    }
});

// MongoDB 연결
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI 환경 변수가 설정되지 않았습니다.');
    process.exit(1);
}

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ MongoDB 연결 성공');
}).catch(err => {
    console.error('❌ MongoDB 연결 실패:', err);
});

// 서버 시작
app.listen(port, () => {
    console.log(`🚀 서버가 ${port}번 포트에서 실행 중입니다.`);
});
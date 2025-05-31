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

// ✅ 여러 도메인을 허용하도록 설정
const allowedOrigins = [
    'https://cheery-bienenstitch-8bad49.netlify.app',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:5500',
    'https://pro-audio.netlify.app'
];

const corsOptions = {
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS 차단: 허용되지 않은 origin'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: false,
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 3600
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Preflight 지원

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 업로드 라우트에 CORS 별도 적용
app.use('/api/upload', cors(corsOptions), uploadRoutes);

// AWS S3 설정
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    maxAttempts: 3,
    retryMode: 'adaptive'
});

// Multer 설정
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 1
    }
});

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

// 전역 에러 핸들러 추가
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        message: '서버 오류가 발생했습니다',
        error: process.env.NODE_ENV === 'development' ? err.message : '알 수 없는 오류'
    });
});

// 파일 업로드 에러 처리 미들웨어
const handleUploadErrors = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                message: '파일 크기가 너무 큽니다.',
                code: 'FILE_TOO_LARGE'
            });
        }
        return res.status(400).json({
            message: '파일 업로드 중 오류가 발생했습니다.',
            code: 'UPLOAD_ERROR'
        });
    }
    next(err);
};

app.use(handleUploadErrors);

// 예약 생성 API 개선
app.post('/api/reservations', upload.single('audio'), async(req, res) => {
    try {
        // 필수 필드 검증
        const requiredFields = ['name', 'age', 'gender', 'email', 'date', 'time', 'memberKey'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                message: '필수 항목이 누락되었습니다',
                fields: missingFields,
                code: 'MISSING_FIELDS'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                message: '오디오 파일이 필요합니다',
                code: 'FILE_REQUIRED'
            });
        }

        // S3 업로드 시도
        const filename = `${Date.now()}_${req.file.originalname}`;
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${filename}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        };

        try {
            await s3Client.send(new PutObjectCommand(uploadParams));
        } catch (s3Error) {
            console.error('S3 Upload Error:', s3Error);
            return res.status(500).json({
                message: 'S3 업로드 실패',
                code: 'S3_UPLOAD_ERROR'
            });
        }

        const audioUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/audio/${filename}`;

        // MongoDB 저장 시도
        const newAlbum = new Album({
            name: req.body.name,
            age: Number(req.body.age),
            gender: req.body.gender,
            email: req.body.email,
            date: new Date(req.body.date),
            albumLength: req.body.time,
            albumDescription: req.body.mainRequest || '',
            note: req.body.note || '',
            reservationCode: req.body.memberKey,
            audioUrl,
            status: '处理中'
        });

        try {
            await newAlbum.save();
        } catch (dbError) {
            console.error('MongoDB Save Error:', dbError);
            // S3에 업로드된 파일 삭제 시도
            try {
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `audio/${filename}`
                }));
            } catch (deleteError) {
                console.error('S3 Delete Error:', deleteError);
            }
            return res.status(500).json({
                message: 'DB 저장 실패',
                code: 'DB_SAVE_ERROR'
            });
        }

        res.status(200).json({
            message: '예약이 완료되었습니다',
            reservationCode: req.body.memberKey,
            audioUrl
        });

    } catch (err) {
        console.error('예약 생성 실패:', err);
        res.status(500).json({
            message: '예약 생성 실패',
            error: process.env.NODE_ENV === 'development' ? err.message : '알 수 없는 오류',
            code: 'RESERVATION_ERROR'
        });
    }
});

// 예약 삭제 API
app.delete('/api/reservations/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) {
            return res.status(404).json({ message: '예약을 찾을 수 없습니다.' });
        }

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
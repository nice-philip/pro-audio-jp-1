const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

console.log('🚀 Starting server...');
console.log('Environment:', {
    PORT: process.env.PORT,
    MONGODB_URI: process.env.MONGODB_URI ? '(set)' : '(not set)',
    AWS_REGION: process.env.AWS_REGION,
    AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? '(set)' : '(not set)',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? '(set)' : '(not set)'
});

// ✅ 라우트 및 모델 로드
const uploadRoutes = require('./routes/upload');
const Album = require('./models/Album');

const app = express();
const port = process.env.PORT || 8080;

// ✅ MongoDB 연결
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
}).then(() => {
    console.log('✅ MongoDB 接続完了');
}).catch((err) => {
    console.error('❌ MongoDB 接続失敗:', err);
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB エラー:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB 接続が切断されました。再接続を試みています...');
    mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
    });
});

// ✅ AWS S3 필수 설정 확인
if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_BUCKET_NAME) {
    console.error('❌ AWS 設定が不足しています');
    process.exit(1);
}

// ✅ 허용된 Origin 리스트
const allowedOrigins = [
    'https://brilliant-unicorn-a5395d.netlify.app',
    'https://cheery-bienenstitch-8bad49.netlify.app',
    'https://pro-audio.netlify.app',
    'https://pro-audio-cn.netlify.app',
    'https://pro-audio-jp.netlify.app',
    'https://surroundio.today',
    'https://pro-audio-jp-1.onrender.com',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:5500'
];

// ✅ CORS 전역 적용
app.use(cors({
    origin: function(origin, callback) {
        console.log('Incoming request from origin:', origin);
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error('CORS blocked. Origin not allowed:', origin);
            callback(new Error('CORS blocked: Origin not allowed'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// ✅ Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ 정적 파일 제공
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ 업로드 API 라우트 연결 (✔️ 수정된 부분)
app.use('/api/upload', uploadRoutes);

// ✅ 예약 조회 API
app.get('/api/reservations', async(req, res) => {
    const key = req.query.key;
    const email = req.query.email;

    if (!key) {
        return res.status(400).json({ message: '予約番号を入力してください' });
    }

    if (!email && key !== 'admin25') {
        return res.status(400).json({ message: 'メールアドレスを入力してください' });
    }

    try {
        if (key === 'admin25') {
            const all = await Album.find().sort({ createdAt: -1 });
            return res.status(200).json(all);
        } else {
            const userReservations = await Album.find({
                reservationCode: key,
                email: email
            }).sort({ createdAt: -1 });

            if (userReservations.length === 0) {
                return res.status(404).json({ message: '予約情報が見つからないか、メールアドレスと予約番号が一致しません' });
            }
            return res.status(200).json(userReservations);
        }
    } catch (err) {
        console.error('❌ 予約照会に失敗:', err);
        return res.status(500).json({ message: '照会に失敗しました', error: err.message });
    }
});

// ✅ 에러 핸들러
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        message: 'サーバーエラーが発生しました',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ✅ 업로드 에러 핸들러
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                message: 'ファイルサイズが制限を超えています',
                code: 'FILE_TOO_LARGE'
            });
        }
        return res.status(400).json({
            message: 'ファイルアップロードに失敗しました',
            code: 'UPLOAD_ERROR'
        });
    }
    next(err);
});

// ✅ 예약 확인 API
app.post('/api/check-reservation', async(req, res) => {
    try {
        const { email, memberKey } = req.body;

        if (!email || !memberKey) {
            return res.status(400).json({
                success: false,
                message: '이메일과 예약번호를 모두 입력해주세요.'
            });
        }

        const reservation = await Album.findOne({
            email: email,
            reservationCode: memberKey
        });

        if (!reservation) {
            return res.status(404).json({
                success: false,
                message: '예약 정보를 찾을 수 없습니다.'
            });
        }

        return res.json({
            success: true,
            reservation: reservation
        });
    } catch (error) {
        console.error('Reservation check error:', error);
        return res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.'
        });
    }
});

// ✅ HTML 파일 라우팅
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'application.html'));
});

app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ✅ 서버 실행
app.listen(port, () => {
    console.log(`🚀 サーバーがポート${port}で起動しました`);
});
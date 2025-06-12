const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
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
const port = process.env.PORT || 3000;

// ✅ MongoDB 연결
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
}).then(async () => {
    console.log('✅ MongoDB 接続完了');
    
    // 데이터베이스 상태 확인
    try {
        const count = await Album.countDocuments();
        console.log(`現在のアルバム数: ${count}`);
        
        const albums = await Album.find().limit(5);
        console.log('最新のアルバム:', albums.map(a => ({
            id: a._id,
            title: a.albumTitle,
            email: a.email,
            createdAt: a.createdAt
        })));
    } catch (err) {
        console.error('❌ データベース確認エラー:', err);
    }
}).catch((err) => {
    console.error('❌ MongoDB 接続失敗:', err);
    process.exit(1);
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

// ✅ AWS S3 클라이언트 초기화
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

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
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400 // preflight 결과를 24시간 캐시
}));

// CORS Preflight 요청에 대한 명시적 처리
app.options('*', cors());

console.log('CORS is enabled for allowed origins:', allowedOrigins);

// ✅ Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ 정적 파일 제공
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ 예약 조회 API
app.get('/api/reservations', async(req, res) => {
    const key = req.query.key;
    const email = req.query.email;

    if (!key) {
        return res.status(400).json({ message: 'パスワードを入力してください' });
    }

    if (!email) {
        return res.status(400).json({ message: 'メールアドレスを入力してください' });
    }

    try {
        if (key === 'admin25') {
            const all = await Album.find()
                .select('-password') // 비밀번호 필드 제외
                .sort({ createdAt: -1 });
            return res.status(200).json(all);
        } else {
            const userReservations = await Album.find({
                password: key,
                email: email
            })
            .select('-password') // 비밀번호 필드 제외
            .sort({ createdAt: -1 });

            if (userReservations.length === 0) {
                return res.status(404).json({ message: '予約情報が見つからないか、メールアドレスとパスワードが一致しません' });
            }
            return res.status(200).json(userReservations);
        }
    } catch (err) {
        console.error('❌ 予約照会に失敗:', err);
        return res.status(500).json({ message: '照会に失敗しました', error: err.message });
    }
});

// ✅ 예약 삭제 API
app.delete('/api/reservations', async (req, res) => {
    const { id, key, email, password } = req.query;

    console.log('Delete request received:', { id, key, email });

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: '無効なIDです' });
    }

    if (key !== 'admin25' || email !== 'admin25' || password !== 'admin25') {
        return res.status(403).json({ message: '管理者権限がありません' });
    }

    try {
        // 삭제 전 전체 앨범 수 확인
        const totalBefore = await Album.countDocuments();
        console.log(`削除前のアルバム総数: ${totalBefore}`);

        // 삭제하려는 앨범 확인
        const targetAlbum = await Album.findById(id);
        if (!targetAlbum) {
            console.log('削除対象のアルバムが見つかりません:', id);
            return res.status(404).json({ message: 'アルバムが見つかりません' });
        }
        console.log('削除対象のアルバム:', {
            id: targetAlbum._id,
            albumNameDomestic: targetAlbum.albumNameDomestic,
            email: targetAlbum.email
        });

        // S3에서 앨범 커버 삭제
        if (targetAlbum.albumCover) {
            try {
                const coverKey = targetAlbum.albumCover.split('/').pop();
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `covers/${coverKey}`
                }));
                console.log('S3からアルバムカバーを削除しました:', coverKey);
            } catch (err) {
                console.error('S3アルバムカバー削除エラー:', err);
            }
        }

        // S3에서 모든 곡 파일 삭제
        if (targetAlbum.songs && targetAlbum.songs.length > 0) {
            for (const song of targetAlbum.songs) {
                if (song.audioUrl) {
                    try {
                        const audioKey = song.audioUrl.split('/').pop();
                        await s3Client.send(new DeleteObjectCommand({
                            Bucket: process.env.AWS_BUCKET_NAME,
                            Key: `audio/${audioKey}`
                        }));
                        console.log('S3から音声ファイルを削除しました:', audioKey);
                    } catch (err) {
                        console.error('S3音声ファイル削除エラー:', err);
                    }
                }
            }
        }

        // MongoDB에서 앨범 삭제
        await Album.findByIdAndDelete(id);
        
        // 삭제 후 전체 앨범 수 확인
        const totalAfter = await Album.countDocuments();
        console.log(`削除後のアルバム総数: ${totalAfter}`);
        
        res.status(200).json({ 
            message: 'アルバムを削除しました',
            deletedId: id,
            totalBefore,
            totalAfter
        });

    } catch (err) {
        console.error('❌ 削除エラー:', err);
        res.status(500).json({ 
            message: '削除に失敗しました', 
            error: err.message 
        });
    }
});

// ✅ 예약 완전 삭제 API (Hard Delete)
app.delete('/api/reservations/permanent', async (req, res) => {
    const { id, key, email, password } = req.query;

    console.log('Permanent delete request received:', { id, key, email, password });

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: '無効なIDです' });
    }

    if (key !== 'admin25' || email !== 'admin25' || password !== 'admin25') {
        return res.status(403).json({ message: '管理者権限がありません' });
    }

    try {
        const result = await Album.findByIdAndDelete(id);

        if (!result) {
            console.log('Album not found:', id);
            return res.status(404).json({ message: 'Album not found in database' });
        }

        console.log('Album permanently deleted:', id);
        return res.status(200).json({ message: 'データベースから完全に削除されました' });
    } catch (err) {
        console.error('❌ 完全削除に失敗:', err);
        return res.status(500).json({ message: 'サーバーエラーが発生しました', error: err.message });
    }
});

// ✅ 업로드 API 라우트 연결
app.use('/api/upload', uploadRoutes);

// ✅ API 경로에 대한 404 핸들러
app.use('/api/*', (req, res) => {
    res.status(404).json({
        message: 'APIエンドポイントが見つかりません',
        code: 'NOT_FOUND'
    });
});

// ✅ 일반 경로에 대한 404 핸들러
app.use((req, res) => {
    if (req.accepts('html')) {
        res.status(404).sendFile(path.join(__dirname, '404.html'));
    } else {
        res.status(404).json({
            message: 'ページが見つかりません',
            code: 'NOT_FOUND'
        });
    }
});

// ✅ 에러 핸들러
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);

    // API 경로에 대한 에러 처리
    if (req.path.startsWith('/api/')) {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    message: 'ファイルサイズが大きすぎます (最大100MB)',
                    code: 'FILE_TOO_LARGE'
                });
            }
            return res.status(400).json({
                message: 'ファイルアップロードに失敗しました',
                code: 'UPLOAD_ERROR',
                error: err.message
            });
        }

        return res.status(500).json({
            message: 'サーバーエラーが発生しました',
            code: 'SERVER_ERROR',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }

    // 일반 경로에 대한 에러 처리
    res.status(500).sendFile(path.join(__dirname, '500.html'));
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
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/application', (req, res) => {
    res.sendFile(path.join(__dirname, 'application.html'));
});

app.listen(port, () => {
    console.log(`✅ Server is running on port ${port}`);
});
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

// MongoDB 연결
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
}).then(() => {
    console.log('✅ MongoDB 连接成功');
}).catch((err) => {
    console.error('❌ MongoDB 连接失败:', err);
});

// MongoDB 연결 에러 처리
mongoose.connection.on('error', (err) => {
    console.error('MongoDB 错误:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB 断开连接，尝试重新连接...');
    mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
    });
});

// AWS S3 설정 검증
if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || 
    !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_BUCKET_NAME) {
    console.error('❌ AWS 配置缺失');
    process.exit(1);
}

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
        return res.status(400).json({ message: '请输入预约号码' });
    }

    try {
        if (key === 'admin25') {
            const all = await Album.find().sort({ createdAt: -1 });
            return res.status(200).json(all);
        } else {
            const userReservations = await Album.find({ reservationCode: key }).sort({ createdAt: -1 });
            if (userReservations.length === 0) {
                return res.status(404).json({ message: '未找到预约信息' });
            }
            return res.status(200).json(userReservations);
        }
    } catch (err) {
        console.error('❌ 查询预约失败:', err);
        return res.status(500).json({ message: '查询失败', error: err.message });
    }
});

// 전역 에러 핸들러 추가
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        message: '服务器错误',
        error: process.env.NODE_ENV === 'development' ? err.message : '未知错误'
    });
});

// 파일 업로드 에러 처리 미들웨어
const handleUploadErrors = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                message: '文件大小超出限制',
                code: 'FILE_TOO_LARGE'
            });
        }
        return res.status(400).json({
            message: '文件上传失败',
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
                message: '缺少必填项',
                fields: missingFields,
                code: 'MISSING_FIELDS'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                message: '请上传音频文件',
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
                message: 'S3上传失败',
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
            date: parseChineseDate(req.body.date),
            albumLength: req.body.time,
            albumDescription: req.body.mainRequest || '',
            note: req.body.note || '',
            reservationCode: req.body.memberKey,
            audioUrl,
            status: '处理中'
        });

        try {
            // 데이터 유효성 검사
            const validationError = newAlbum.validateSync();
            if (validationError) {
                console.error('Validation Error:', validationError);
                return res.status(400).json({
                    message: '数据验证失败',
                    errors: validationError.errors,
                    code: 'VALIDATION_ERROR'
                });
            }

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
                message: '数据库保存失败',
                code: 'DB_SAVE_ERROR'
            });
        }

        res.status(200).json({
            message: '预约完成',
            reservationCode: req.body.memberKey,
            audioUrl
        });

    } catch (err) {
        console.error('예약 생성 실패:', err);
        res.status(500).json({
            message: '预约创建失败',
            error: process.env.NODE_ENV === 'development' ? err.message : '未知错误',
            code: 'RESERVATION_ERROR'
        });
    }
});

// 예약 삭제 API
app.delete('/api/reservations/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) {
            return res.status(404).json({ message: '未找到预约' });
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
        res.status(200).json({ message: '预约已删除' });
    } catch (err) {
        console.error('❌ 删除预约失败:', err);
        res.status(500).json({ message: '删除预约失败', error: err.message });
    }
});

// 날짜 변환 함수 추가
function parseChineseDate(dateStr) {
    try {
        // "YYYY年MM月DD日" 형식에서 숫자만 추출
        const matches = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (!matches) {
            console.error('날짜 형식 오류:', dateStr);
            throw new Error('Invalid date format');
        }
        
        const [_, year, month, day] = matches;
        // month는 0-based이므로 1을 빼줍니다
        const date = new Date(year, month - 1, day);
        
        // 유효한 날짜인지 확인
        if (isNaN(date.getTime())) {
            console.error('유효하지 않은 날짜:', dateStr);
            throw new Error('Invalid date');
        }
        
        return date;
    } catch (error) {
        console.error('날짜 파싱 오류:', error);
        throw error;
    }
}

// 서버 시작
app.listen(port, () => {
    console.log(`🚀 服务器运行在端口 ${port}`);
});
// ✅ server.js (전체 수정 버전)
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

const uploadRoutes = require('./upload');
const Album = require('./models/Album');

const app = express();
const port = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
}).then(async() => {
    console.log('✅ MongoDB 接続完了');
    try {
        const count = await Album.countDocuments();
        console.log(`現在のアルバム数: ${count}`);
        const albums = await Album.find().sort({ _id: -1 }).limit(5);
        console.log('最新のアルバム:', albums);
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

if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_BUCKET_NAME) {
    console.error('❌ AWS 設定が不足しています');
    process.exit(1);
}

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

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

app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

console.log('CORS is enabled for allowed origins:', allowedOrigins);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/upload', uploadRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/application', (req, res) => {
    res.sendFile(path.join(__dirname, 'application.html'));
});

app.listen(port, () => {
    console.log(`✅ Server is running on port ${port}`);
});
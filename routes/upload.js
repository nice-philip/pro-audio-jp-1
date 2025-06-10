const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Album = require('../models/Album');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// S3 클라이언트 초기화
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Multer 설정
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath;
        if (file.fieldname === 'image') {
            uploadPath = 'uploads/images/';
        } else if (file.fieldname === 'audio') {
            uploadPath = 'uploads/audio/';
        }
        
        // 디렉토리가 없으면 생성
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = uuidv4();
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.fieldname === 'image') {
            if (!file.originalname.match(/\.(jpg|jpeg)$/)) {
                return cb(new Error('JPG 形式の画像のみアップロード可能です。'), false);
            }
        } else if (file.fieldname === 'audio') {
            if (!file.originalname.match(/\.(wav)$/)) {
                return cb(new Error('WAV 形式の音声ファイルのみアップロード可能です。'), false);
            }
        }
        cb(null, true);
    },
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    }
});

// S3에 파일 업로드하는 함수
async function uploadToS3(file, type) {
    try {
        const fileStream = fs.createReadStream(file.path);
        const key = `${type}/${path.basename(file.path)}`;
        
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            Body: fileStream,
            ContentType: file.mimetype
        };

        await s3Client.send(new PutObjectCommand(uploadParams));
        
        // 로컬 파일 삭제
        fs.unlinkSync(file.path);
        
        return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    } catch (error) {
        console.error('S3 upload error:', error);
        throw error;
    }
}

// 메인 앨범 업로드
router.post('/', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('Received files:', req.files);
        console.log('Received body:', req.body);

        if (!req.files || !req.files['image'] || !req.files['audio']) {
            throw new Error('画像と音声ファイルは必須です。');
        }

        const imageFile = req.files['image'][0];
        const audioFile = req.files['audio'][0];

        // S3에 파일 업로드
        const imageUrl = await uploadToS3(imageFile, 'images');
        const audioUrl = await uploadToS3(audioFile, 'audio');

        const albumData = {
            albumTitle: req.body.albumTitle,
            nameEn: req.body.nameEn,
            nameKana: req.body.nameKana,
            artistInfo: req.body.artistInfo,
            isReleased: req.body.isReleased === 'true',
            imageUrl: imageUrl,
            genre: req.body.genre,
            youtubeMonetize: req.body.youtubeMonetize,
            youtubeAgree: req.body.youtubeAgree === 'true',
            songs: [{
                title: req.body.songTitle,
                titleEn: req.body.songTitleEn,
                date: new Date(req.body.date),
                duration: req.body.time,
                audioUrl: audioUrl,
                isClassical: req.body.isClassical === 'true'
            }]
        };

        // 디버깅을 위한 로그 추가
        console.log('Processing album data:', {
            youtubeMonetize: req.body.youtubeMonetize,
            youtubeAgree: req.body.youtubeAgree,
            processedYoutubeAgree: albumData.youtubeAgree
        });

        // 클래식 음악의 경우 추가 정보
        if (req.body.isClassical === 'true') {
            albumData.songs[0].classicalInfo = {
                composer: req.body.composer,
                opusNumber: req.body.opusNumber,
                movement: req.body.movement,
                tempo: req.body.tempo
            };
        }

        const album = new Album(albumData);
        await album.save();

        res.status(201).json({
            message: 'アップロードが完了しました。',
            album: album
        });
    } catch (error) {
        console.error('Upload error:', error);
        
        // 에러 발생 시 업로드된 파일 삭제
        if (req.files) {
            Object.values(req.files).forEach(files => {
                files.forEach(file => {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                });
            });
        }
        
        res.status(400).json({
            message: error.message || 'アップロードに失敗しました。',
            error: error.message
        });
    }
});

// 追加曲アップロード
router.post('/:albumId/song', upload.single('audio'), async (req, res) => {
    try {
        const album = await Album.findById(req.params.albumId);
        if (!album) {
            throw new Error('アルバムが見つかりません。');
        }

        const songData = {
            title: req.body.songTitle,
            titleEn: req.body.songTitleEn,
            date: req.body.date,
            duration: req.body.time,
            audioUrl: req.file.path,
            isClassical: req.body.isClassical === 'true'
        };

        if (req.body.isClassical === 'true') {
            songData.classicalInfo = {
                composer: req.body.composer,
                opusNumber: req.body.opusNumber,
                movement: req.body.movement,
                tempo: req.body.tempo
            };
        }

        album.songs.push(songData);
        await album.save();

        res.status(201).json({
            message: '曲が追加されました。',
            song: songData
        });
    } catch (error) {
        // エラー発生時にアップロードされたファイルを削除
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(400).json({
            message: error.message || '曲の追加に失敗しました。',
            error: error.message
        });
    }
});

module.exports = router; 
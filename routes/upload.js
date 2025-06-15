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
        let uploadPath = 'uploads/';
        if (file.fieldname === 'image') {
            uploadPath += 'images/';
        } else if (file.fieldname === 'audioFiles') {
            uploadPath += 'audio/';
        } else {
            return cb(new Error('Invalid file field'));
        }
        fs.mkdirSync(uploadPath, { recursive: true });
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
        } else if (file.fieldname === 'audioFiles') {
            if (!file.originalname.match(/\.(wav)$/)) {
                return cb(new Error('WAV 形式の音声ファイルのみアップロード可能です。'), false);
            }
        }
        cb(null, true);
    },
    limits: {
        fileSize: 100 * 1024 * 1024
    }
});

// Helper function to parse array fields
const parseArrayField = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return value.split(',').map(item => item.trim());
        }
    }
    return [];
};

// S3에 파일 업로드
async function uploadToS3(file, type) {
    const fileStream = fs.createReadStream(file.path);
    const key = `${type}/${path.basename(file.path)}`;
    const uploadParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: fileStream,
        ContentType: file.mimetype
    };
    await s3Client.send(new PutObjectCommand(uploadParams));
    fs.unlinkSync(file.path);
    return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

// 메인 앨범 업로드
router.post('/', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'audioFiles', maxCount: 3 }
]), async (req, res) => {
    try {
        console.log('Received files:', req.files);
        console.log('Received body:', req.body);

        if (!req.files || !req.files['image']) {
            throw new Error('画像ファイルは必須です。');
        }

        const imageFile = req.files['image'][0];
        const imageUrl = await uploadToS3(imageFile, 'images');

        let songs = [];
        try {
            songs = req.body.songs.map(songStr => JSON.parse(songStr));
        } catch (error) {
            throw new Error('楽曲データの解析に失敗しました。');
        }

        if (songs.length === 0 || songs.length > 3) {
            throw new Error('楽曲は1曲から3曲までアップロード可能です。');
        }

        const processedSongs = await Promise.all(songs.map(async (song, index) => {
            const audioFile = req.files['audioFiles']?.[index];
            if (!audioFile) {
                throw new Error(`${index + 1}曲目の音声ファイルが見つかりません。`);
            }
            const audioUrl = await uploadToS3(audioFile, 'audio');

            const songData = {
                title: song.songTitle,
                titleEn: song.songTitleEn,
                duration: song.duration,
                audioUrl: audioUrl,
                isClassical: song.isClassical
            };

            if (song.date && song.date !== 'Invalid Date') {
                try {
                    const dateStr = song.date.replace(/年|月|日/g, '-').slice(0, -1);
                    const parsedDate = new Date(dateStr);
                    if (!isNaN(parsedDate.getTime())) {
                        songData.date = parsedDate;
                    }
                } catch {
                    console.warn('Invalid date format:', song.date);
                }
            }

            if (song.isClassical) {
                songData.classicalInfo = {
                    composer: song.composer,
                    opusNumber: song.opusNumber,
                    movement: song.movement,
                    tempo: song.tempo
                };
            }

            return songData;
        }));

        const albumData = {
            albumTitle: req.body.albumTitle,
            nameEn: req.body.nameEn,
            nameKana: req.body.nameKana,
            email: req.body.email,
            password: req.body.password,
            artistInfo: req.body.artistInfo,
            isReleased: req.body.isReleased === 'true',
            imageUrl: imageUrl,
            genre: req.body.genre,
            youtubeMonetize: req.body.youtubeMonetize,
            youtubeAgree: req.body.youtubeAgree === 'true',
            platforms: parseArrayField(req.body.platforms),
            excludedCountries: parseArrayField(req.body.excludedCountries),
            songs: processedSongs
        };

        const album = new Album(albumData);
        await album.save();

        res.status(201).json({
            message: 'アップロードが完了しました。',
            album: album
        });
    } catch (error) {
        console.error('Upload error:', error);
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

// 추가 곡 업로드
router.post('/:albumId/song', upload.single('audioFiles'), async (req, res) => {
    try {
        const album = await Album.findById(req.params.albumId);
        if (!album) {
            throw new Error('アルバムが見つかりません。');
        }

        const audioUrl = await uploadToS3(req.file, 'audio');

        const songData = {
            title: req.body.songTitle,
            titleEn: req.body.songTitleEn,
            duration: req.body.time,
            audioUrl: audioUrl,
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

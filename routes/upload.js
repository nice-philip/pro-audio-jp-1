const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Album = require('../models/Album');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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
                return cb(new Error('JPG 형식의 이미지만 업로드 가능합니다.'), false);
            }
        } else if (file.fieldname === 'audio') {
            if (!file.originalname.match(/\.(wav)$/)) {
                return cb(new Error('WAV 형식의 오디오 파일만 업로드 가능합니다.'), false);
            }
        }
        cb(null, true);
    }
});

// 메인 앨범 업로드
router.post('/album', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
]), async (req, res) => {
    try {
        const imageFile = req.files['image'][0];
        const audioFile = req.files['audio'][0];

        const albumData = {
            albumTitle: req.body.albumTitle,
            nameEn: req.body.nameEn,
            nameKana: req.body.nameKana,
            artistInfo: req.body.artistInfo,
            isReleased: req.body.isReleased === 'true',
            imageUrl: imageFile.path,
            genre: req.body.genre,
            youtubeMonetize: req.body.youtubeMonetize === 'true',
            songs: [{
                title: req.body.songTitle,
                titleEn: req.body.songTitleEn,
                date: new Date(req.body.date),
                duration: req.body.time,
                audioUrl: audioFile.path,
                isClassical: req.body.isClassical === 'true'
            }]
        };

        // 클래식 음악인 경우 추가 정보
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
            message: '앨범이 성공적으로 등록되었습니다.',
            album: album
        });
    } catch (error) {
        // 에러 발생 시 업로드된 파일 삭제
        if (req.files) {
            Object.values(req.files).forEach(files => {
                files.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            });
        }
        
        res.status(400).json({
            message: '앨범 등록에 실패했습니다.',
            error: error.message
        });
    }
});

// 추가 곡 업로드
router.post('/album/:albumId/song', upload.single('audio'), async (req, res) => {
    try {
        const album = await Album.findById(req.params.albumId);
        if (!album) {
            throw new Error('앨범을 찾을 수 없습니다.');
        }

        const songData = {
            title: req.body.songTitle,
            titleEn: req.body.songTitleEn,
            date: new Date(req.body.date),
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
            message: '곡이 성공적으로 추가되었습니다.',
            song: songData
        });
    } catch (error) {
        // 에러 발생 시 업로드된 파일 삭제
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(400).json({
            message: '곡 추가에 실패했습니다.',
            error: error.message
        });
    }
});

module.exports = router; 
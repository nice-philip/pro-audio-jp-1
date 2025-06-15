const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    titleEn: {
        type: String,
        required: true
    },
    duration: {
        minutes: {
            type: Number,
            required: true,
            min: 0
        },
        seconds: {
            type: Number,
            required: true,
            min: 0,
            max: 59
        }
    },
    genre: {
        type: String,
        required: true,
        enum: ['rock', 'pop', 'jazz', 'classical', 'electronic', 'hiphop', 'country', 'experimental']
    },
    audioUrl: {
        type: String,
        required: true
    },
    isRemake: {
        type: String,
        required: true,
        enum: ['yes', 'no']
    },
    usesExternalBeat: {
        type: String,
        required: true,
        enum: ['yes', 'no']
    },
    language: {
        type: String,
        required: true,
        enum: ['instrumental', 'japanese', 'english', 'korean', 'chinese', 'spanish', 'french', 'german', 'italian', 'portuguese', 'russian', 'arabic', 'hindi', 'bengali', 'punjabi', 'javanese', 'vietnamese', 'thai', 'turkish', 'persian']
    },
    lyrics: {
        type: String,
        required: false
    },
    hasExplicitContent: {
        type: Boolean,
        default: false
    }
});

const albumSchema = new mongoose.Schema({
    releaseDate: {
        type: Date,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    albumNameDomestic: {
        type: String,
        required: true
    },
    albumNameInternational: {
        type: String,
        required: true
    },
    albumCover: {
        type: String,
        required: true
    },
    rightsAgreement: {
        type: Boolean,
        required: true
    },
    reReleaseAgreement: {
        type: Boolean,
        required: true
    },
    platformAgreement: {
        type: Boolean,
        required: true
    },
    platforms: [{
        type: String,
        enum: ['spotify', 'apple_music', 'youtube_music', 'amazon_music', 'tidal', 'deezer', 'pandora', 'soundcloud', 'napster', 'anghami', 'joox', 'kkbox', 'line_music', 'qq_music', 'netease']
    }],
    excludedCountries: [{
        type: String,
        enum: ['JP', 'CN', 'KR', 'TW', 'HK', 'SG', 'MY', 'ID', 'TH', 'VN', 'PH', 'IN', 'PK', 'BD', 'LK', 'GB', 'FR', 'DE', 'IT', 'ES', 'PT', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'IE', 'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'AU', 'NZ', 'RU', 'TR', 'ZA', 'EG', 'SA', 'AE', 'IL', 'IR']
    }],
    youtubeMonetize: {
        type: Boolean,
        default: false
    },
    songs: [songSchema],
    status: {
        type: String,
        enum: ['処理中', '完了', 'エラー'],
        default: '処理中'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 저장 전 날짜 유효성 검사
albumSchema.pre('save', function(next) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);  // Set time to start of day
    
    const minDate = new Date(today);
    minDate.setDate(today.getDate() + 21); // 3 weeks from today
    minDate.setHours(0, 0, 0, 0);  // Set time to start of day

    const releaseDate = new Date(this.releaseDate);
    releaseDate.setHours(0, 0, 0, 0);  // Set time to start of day

    if (releaseDate < minDate) {
        return next(new Error('配信開始日は本日から3週間以降の日付を選択してください'));
    }
    
    next();
});

module.exports = mongoose.model('Album', albumSchema, 'albums-jp');
const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
    songNameJapanese: {
        type: String,
        required: true
    },
    songNameEnglish: {
        type: String,
        required: true
    },
    genre: {
        type: String,
        required: true,
        enum: [
            'rock',
            'pop',
            'jazz',
            'classical',
            'electronic',
            'hiphop',
            'country',
            'experimental',
            'folk',
            'blues',
            'r&b',
            'soul',
            'funk',
            'reggae',
            'latin',
            'world',
            'ambient',
            'newage',
            'metal',
            'punk',
            'indie',
            'alternative',
            'dance',
            'house',
            'techno',
            'trance',
            'dubstep',
            'drumandbass',
            'trap',
            'futurebass',
            'lofi',
            'synthwave',
            'vaporwave',
            'chillout',
            'lounge',
            'jpop',
            'kpop',
            'anime',
            'game',
            'orchestral',
            'soundtrack',
            'children',
            'holiday',
            'religious',
            'spoken',
            'comedy',
            'other'
        ]
    },
    mainArtist: [String],
    participatingArtist: [String],
    featuring: [String],
    mixingEngineer: [String],
    recordingEngineer: [String],
    producer: [String],
    lyricist: [String],
    composer: [String],
    arranger: [String],
    audioUrl: {
        type: String,
        required: true
    },
    isRemake: {
        type: String,
        enum: ['yes', 'no'],
        required: true
    },
    usesExternalBeat: {
        type: String,
        enum: ['yes', 'no'],
        required: true
    },
    language: {
        type: String,
        required: true,
        enum: [
            'instrumental',
            'japanese',
            'english',
            'korean',
            'chinese',
            'spanish',
            'french',
            'german',
            'italian',
            'portuguese',
            'russian',
            'arabic',
            'hindi',
            'bengali',
            'punjabi',
            'javanese',
            'vietnamese',
            'thai',
            'turkish',
            'persian'
        ]
    },
    lyrics: String,
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
    albumNameJapanese: {
        type: String,
        required: true
    },
    albumNameEnglish: {
        type: String,
        required: true
    },
    artistNameJapanese: {
        type: String,
        required: true
    },
    artistNameEnglish: {
        type: String,
        required: true
    },
    versionInfo: {
        type: String,
        required: true
    },
    songs: [songSchema],
    albumCover: {
        type: String,
        required: true
    },
    platforms: {
        type: [String],
        default: []
    },
    excludedCountries: {
        type: [String],
        default: []
    },
    genre: {
        type: String,
        required: true,
        enum: [
            'pop',
            'rock',
            'jazz',
            'classical',
            'electronic',
            'hiphop',
            'rb',
            'folk',
            'world',
            'ambient',
            'metal',
            'blues',
            'country',
            'experimental',
            'fusion'
        ]
    },
    youtubeMonetize: {
        type: Boolean,
        default: false
    },
    youtubeAgree: {
        type: Boolean,
        default: false
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
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    paymentAmount: {
        type: Number,
        default: 20000 // 20,000円 (税込)
    },
    payLater: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Album', albumSchema, 'albums-jp');
const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
    mainArtist: [String],
    participatingArtist: [String],
    featuring: [String],
    mixingEngineer: [String],
    recordingEngineer: [String],
    producer: [String],
    lyricist: [String],
    composer: [String],
    arranger: [String],
    audioUrl: String,
    isRemake: {
        type: String,
        enum: ['yes', 'no'],
        default: 'no'
    },
    usesExternalBeat: {
        type: String,
        enum: ['yes', 'no'],
        default: 'no'
    },
    language: {
        type: String,
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
        ],
        default: 'japanese'
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
    albumNameDomestic: {
        type: String,
        required: true
    },
    albumNameInternational: {
        type: String,
        required: true
    },
    artistNameKana: {
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
        type: String,
        enum: ['yes', 'no'],
        default: 'no'
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
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Album', albumSchema);
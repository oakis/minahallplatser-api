const express = require('express');
const router = express.Router();
const _ = require('lodash');

const admin = require("firebase-admin");

const serviceAccount = require('./firebase.json');
const fbAdmin = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://minahallplatser.firebaseio.com"
});

// Data

let db = [];
let users = [];
let stats = [];

const firebase = fbAdmin.database().ref();

firebase.on('value', snapshot => {
    db = snapshot.val();
    users = _.values(snapshot.val().users);
    stats = snapshot.val().stats;
});

// Endpoints

router.route('/')
.get((req, res) => {
    res.json(
		{
			message: 'Hello Firebase World!'
		}
	);
})

// Users

router.route('/userscount')
.get((req, res) => {
    let registered = 0;
    let anonymous = 0;
    let unknown = 0;
    users.forEach((user) => {
        if (user.isAnonymous === true) {
            registered++;
        } else if (user.isAnonymous === false) {
            anonymous++;
        } else {
            unknown++;
        }
    });
    res.json({
        registered,
        anonymous,
        unknown
    });
})

router.route('/users')
.get((req, res) => {
    const data = _.values(_.mapValues(db.users, function(value, key) { value.id = key; return value; }))
    res.json(data);
})

// Counts

router.route('/departurescount')
.get((req, res) => {
    res.json({
        success: true,
        departuresCount: stats.departuresCount
    });
})
.post((req, res) => {
    if (stats.departuresCount >= 0) {
        const newValue = parseInt(stats.departuresCount) + parseInt(req.body.count);
        firebase.child('stats').update({
            departuresCount: newValue
        });
        res.json({
            success: true,
            message: `Departures Count Updated ${newValue}`,
            departuresCount: newValue
        });
    } else {
        res.json({
            success: false,
            message: 'Firebase is not loaded.'
        })
    }
})

router.route('/stopscount')
.get((req, res) => {
    res.json({
        success: true,
        stopsCount: stats.stopsCount
    });
})
.post((req, res) => {
    if (stats.stopsCount >= 0) {
        const newValue = parseInt(stats.stopsCount) + 1;
        firebase.child('stats').update({
            stopsCount: newValue
        });
        res.json({
            success: true,
            message: `Stops Count Updated to ${newValue}`,
            stopsCount: newValue
        });
    } else {
        res.json({
            success: false,
            message: 'Firebase is not loaded.'
        })
    }
})


module.exports = router;

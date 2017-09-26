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

fbAdmin.database().ref().on('value', snapshot => {
    db = snapshot.val();
    users = _.values(snapshot.val().users);
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


module.exports = router;

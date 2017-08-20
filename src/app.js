const express = require('express');
const moment = require('moment');
const _ = require('lodash');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const port = 3333;

const router = express.Router();

router.get('/', (req, res) => {
	res.json(
		{
			message: 'Hello Public Transit World!'
		}
	);
});

router.use((req, res, next) => {
	if (req.body.id)
		console.log(`${req.method}: ${req.url} - id: ${req.body.id} token: ${req.body.access_token}`);
	else if (req.body.busStop)
		console.log(`${req.method}: ${req.url} - search: ${req.body.busStop} token: ${req.body.access_token}`);
	else if (req.body.latitude && req.body.longitude)
		console.log(`${req.method}: ${req.url} - latitude: ${req.body.latitude} longitude: ${req.body.longitude} token: ${req.body.access_token}`);	
	next();
});

router.route('/departures')
.post((req, res) => {
	const { access_token, id } = req.body;
	const date = moment().format('YYYY-MM-DD');
	const time = moment().format('HH:mm');
	if (!access_token || !id) {
		res.status(401).json({
			success: false,
			data: 'access_token or id is missing'
		});
		return;
	}
	request({
		url: `https://api.vasttrafik.se/bin/rest.exe/v2/departureBoard?id=${id}&date=${date}&time=${time}&format=json&timeSpan=90&maxDeparturesPerLine=2&needJourneyDetail=0`,
		auth: {
			'bearer': access_token
		}
	}, (err, response) => {
		const departures = JSON.parse(response.body);
		if (departures.DepartureBoard) {
			if (departures.DepartureBoard.Departure) {
				const serverdate = departures.DepartureBoard.serverdate || moment().format('YYYY-MM-DD');
				const servertime = departures.DepartureBoard.servertime || moment().format('HH:mm');
				const now = moment(
					`${serverdate} ${servertime}`
				);
				let mapdDepartures = [];
				departures.DepartureBoard.Departure.forEach((item) => {
					const findIndex = _.findIndex(mapdDepartures,
						{ name: item.name, direction: item.direction }
					);
					const timeDeparture = moment(
						`${item.date} ${item.rtTime || item.time}`
					);
					const timeLeft = timeDeparture.diff(now, 'minutes');
					if (findIndex !== -1 && !mapdDepartures[findIndex].nextStop) {
						mapdDepartures[findIndex].nextStop = timeLeft;
					} else if (findIndex === -1) {
						mapdDepartures.push({ ...item, nextStop: null, timeLeft: (timeLeft <= 0) ? 0 : timeLeft });
					}
				});

				mapdDepartures = _.orderBy(mapdDepartures, ['timeLeft', 'nextStop']);
				mapdDepartures = _.map(mapdDepartures, (dep, index) => {
					return { ...dep, index };
				});
				res.status(200).json({
					success: true,
					data: {
						departures: mapdDepartures,
						time: servertime,
						date: serverdate
					}
				});
			} else {
				res.status(500).json({
					success: false,
					data: 'Inga avgångar hittades på denna hållplats.'
				});
			}
		} else {
			res.status(500).json({
				success: false,
				data: 'Något gick snett. Försök igen om en stund.'
			});
		}
	});
});

router.route('/search')
.post((req, res) => {
	const { access_token, busStop } = req.body;
	if (!access_token || !busStop) {
		res.status(401).json({
			success: false,
			data: 'access_token or id is missing'
		});
		return;
	}
	request({
		url: `https://api.vasttrafik.se/bin/rest.exe/v2/location.name?input=${busStop}&format=json`,
		auth: {
			'bearer': access_token
		}
	}, (err, response) => {
		const list = JSON.parse(response.body);
		if (!err)
			res.status(200).json({ success: true, data: (Array.isArray(list.LocationList.StopLocation)) ? list.LocationList.StopLocation : [ list.LocationList.StopLocation ] });
		else {
			res.status(500).json({
				success: true,
				data: { searchError: 'Kunde inte kontakta Västtrafik. Försök igen senare.' }
			});
		}
	});
});

router.route('/gps')
.post((req, res) => {
	const { access_token, latitude, longitude } = req.body;
	if (!access_token || !latitude || !longitude) {
		res.status(401).json({
			success: false,
			data: 'access_token, latitude or longitude is missing'
		});
		return;
	}
	request({
		url: `https://api.vasttrafik.se/bin/rest.exe/v2/location.nearbystops?originCoordLat=${latitude}&originCoordLong=${longitude}&format=json`,
		auth: {
			'bearer': access_token
		}
	}, (err, response) => {
		const list = JSON.parse(response.body);
		if (!list.LocationList.StopLocation) {
			res.status(500).json({
				success: false,
				data: { searchError: 'Hittade inga hållplatser nära dig.' }
			});
		} else {
			const mapdList = _.uniqBy(_.filter(list.LocationList.StopLocation, (o) => !o.track), 'name');
			res.status(200).json({ success: true, data: mapdList });
		}
	});
});

app.use('/api', router);
app.listen(port, function () {
  	console.log(`Running Mina Hållplatser API on port ${port}!`);
});

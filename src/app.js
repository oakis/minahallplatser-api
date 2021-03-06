const express = require('express');
const moment = require('moment');
const _ = require('lodash');
const bodyParser = require('body-parser');
const request = require('r2');
const app = express();

const firebaseRouter = require('./routes/firebase');
const vasttrafikRouter = require('./routes/vasttrafik');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const port = 3333;

function filterDepartures(list) {
	if (list.LocationList.hasOwnProperty('StopLocation')) {
		const data = (Array.isArray(list.LocationList.StopLocation)) ? list.LocationList.StopLocation.splice(0,10) : [ list.LocationList.StopLocation ];
		const filtered = _.filter(data, (stop) => !stop.name.startsWith('.'));
		return filtered;
	}
	return [];
}

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
		console.log(`${moment().format()} - ${req.method}: ${req.url} - id: ${req.body.id} token: ${req.body.access_token}`);
	else if (req.body.busStop)
		console.log(`${moment().format()} - ${req.method}: ${req.url} - search: ${req.body.busStop} token: ${req.body.access_token}`);
	else if (req.body.latitude && req.body.longitude)
		console.log(`${moment().format()} - ${req.method}: ${req.url} - latitude: ${req.body.latitude} longitude: ${req.body.longitude} token: ${req.body.access_token}`);
	next();
});

router.route('/departures')
.post(async (req, res) => {
	const { access_token, id } = req.body;
	const date = moment().format('YYYY-MM-DD');
	const time = moment().format('HH:mm');
	if (!access_token || !id) {
		return res.json({
			success: false,
			data: []
		});
	}
	const headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Authorization': `Bearer ${access_token}`
	}
	const departures = await request(`https://api.vasttrafik.se/bin/rest.exe/v2/departureBoard?id=${id}&date=${date}&time=${time}&format=json&timeSpan=90&maxDeparturesPerLine=2&needJourneyDetail=0`, { headers }).json;
	if (departures.DepartureBoard) {
		if (departures.DepartureBoard.Departure) {
			departures.DepartureBoard.Departure = (departures.DepartureBoard.Departure.length) ? departures.DepartureBoard.Departure : [departures.DepartureBoard.Departure];
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
			if (mapdDepartures.length > 0) {
				res.status(200).json({
					success: true,
					data: {
						departures: mapdDepartures,
						time: servertime,
						date: serverdate
					}
				});
			} else {
				res.json({
					success: false,
					data: 'Inga avgångar hittades på denna hållplats.'
				});
			}
		} else {
			res.json({
				success: false,
				data: 'Inga avgångar hittades på denna hållplats.'
			});
		}
	} else {
		res.json({
			success: false,
			data: 'Något gick snett. Försök igen om en stund.'
		});
	}
});



router.route('/search')
.post(async (req, res) => {
	const { access_token, busStop } = req.body;
	if (!access_token || !busStop) {
		return res.json({
			success: false,
			data: []
		});
	}
	const headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Authorization': `Bearer ${access_token}`
	}
	const list = await request(`https://api.vasttrafik.se/bin/rest.exe/v2/location.name?input=${busStop}&format=json`, { headers }).json;
	const filteredResponse = filterDepartures(list);
	if (filteredResponse.length > 0) {
		res.status(200).json({ success: true, data: filteredResponse });
	} else if (filteredResponse.length === 0) {
		res.json({
			success: false,
			data: 'Hittade inga hållplatser. Prova att söka på något annat.'
		})
	} else {
		res.json({
			success: false,
			data: 'Kunde inte kontakta Västtrafik. Försök igen senare.'
		});
	}
});

router.route('/gps')
.post(async (req, res) => {
	const { access_token, latitude, longitude } = req.body;
	if (!access_token || !latitude || !longitude) {
		return res.json({
			success: false,
			data: []
		});
	}
	const headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Authorization': `Bearer ${access_token}`
	}
	const list = await request(`https://api.vasttrafik.se/bin/rest.exe/v2/location.nearbystops?originCoordLat=${latitude}&originCoordLong=${longitude}&format=json`, { headers }).json;
	const filteredResponse = filterDepartures(list);
	if (filteredResponse.length === 0) {
		res.json({
			success: false,
			data: 'Hittade inga hållplatser nära dig.'
		});
	} else {
		const mapdList = _.uniqBy(_.filter(filteredResponse, (o) => !o.track), 'name');
		res.status(200).json({ success: true, data: mapdList });
	}
});

app.use('/api', router);
app.use('/api/firebase', firebaseRouter);
app.use('/api/vasttrafik', vasttrafikRouter);
app.listen(port, function () {
  	console.log(`Running Mina Hållplatser API on port ${port}!`);
});

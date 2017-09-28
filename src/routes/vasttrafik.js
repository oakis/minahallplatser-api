const express = require('express');
const router = express.Router();
const moment = require('moment');
const _ = require('lodash');
const request = require('r2');
const handleError = require('../error');

function filterDepartures(list) {
	if (list.LocationList.hasOwnProperty('StopLocation')) {
		const data = (Array.isArray(list.LocationList.StopLocation)) ? list.LocationList.StopLocation.splice(0,10) : [ list.LocationList.StopLocation ];
		const filtered = _.filter(data, (stop) => !stop.name.startsWith('.'));
		return filtered;
	}
	return [];
}

router.route('/')
.get((req, res) => {
    res.json(
		{
			message: 'Hello Västtrafik World!'
		}
	);
})

router.route('/departures').post(getDepartures);

async function getDepartures (req, res) {
	try {
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
							date: serverdate,
							timestamp: moment().format()
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
	} catch (e) {
		try {
			await handleError(e);
			console.log(`Got error code "${e.code}", trying to fetch again`);
			getDepartures(req, res);
		} catch (error) {
			res.json({
				success: false,
				data: 'Något gick snett. Försök igen om en stund.'
			});
			console.log(`{$req.url} error:`, error);
		}
	}
}


router.route('/search').post(searchStops);

async function searchStops (req, res) {
	try {
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
	} catch (e) {
		try {
			await handleError(e);
			console.log(`Got error code "${e.code}", trying to fetch again`);
			searchStops(req, res);
		} catch (error) {
			res.json({
				success: false,
				data: 'Något gick snett. Försök igen om en stund.'
			});
			console.log(`{$req.url} error:`, error);
		}
	}
}


router.route('/gps').post(getNearbyStops);
async function getNearbyStops (req, res) {
	try {
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
	} catch (e) {
		try {
			await handleError(e);
			console.log(`Got error code "${e.code}", trying to fetch again`);
			getNearbyStops(req, res);
		} catch (error) {
			res.json({
				success: false,
				data: 'Något gick snett. Försök igen om en stund.'
			});
			console.log(`{$req.url} error:`, error);
		}
	}
}

module.exports = router;

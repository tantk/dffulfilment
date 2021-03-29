var express = require("express");
var app = express();
var bodyParser = require('body-parser');
var admin = require('firebase-admin');
app.use(bodyParser.json());

var serviceAccount = require('./sgtrafficcam-47e71-firebase-adminsdk-kdaxz-c9e4a1df7d.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://sgtrafficcam-47e71.firebaseio.com/'
});

app.post("/dfPost",function(req,res)
{
	console.log('query route');
	let intent = req.body.queryResult.intent.displayName;
	if (intent == 'query_Camera_selectArea')
	{
		let cameraArea = req.body.queryResult.parameters.CameraArea;
		let rootRef = admin.database().ref();
		let camRef = rootRef.child('trafficCam');
		let queryResult;
		let queryPromise = new Promise(function(resolve, reject){
			if (cameraArea == 'IncludeAll')
			{
				camRef.once("value", function(camData)
				{
					if (camData.val() != null)
					{
						queryResult = JSON.stringify(camData.val(),null,2);	
						resolve('QueryFound');
					}	
				});
			}
			else
			{
				queriedPromise = camRef.child(cameraArea).once("value", function(camData)
				{
					if (camData.val() != null)
					{
						queryResult = JSON.stringify(camData.val(),null,2);
						resolve('QueryFound');
					}		
				});
			}
		});
		let timeout = new Promise(function(resolve, reject){
			setTimeout(function(){ resolve("TimeOut"); }, 4000);
		});

		Promise.race([queryPromise,timeout]).then(function(value)
		{
			if(value =="TimeOut")
			{
				res.send({"fulfillmentText": "An error occured in the server, try again later"});
			}
			else
			{
				res.send({"fulfillmentText": `TrafficCamID : Desc \n ${queryResult}`});
			}
		});
	}
	if (intent == 'query_trafficimage')
	{
		let cameraID = req.body.queryResult.parameters.CameraID;
		let rootRef = admin.database().ref();
		let camRef = rootRef.child('trafficCam');
		let trafficCamDesc;
		let rDateTime;
		try
		{
			let queryPromise = new Promise(function(resolve, reject)
			{
				camRef.child('ALL').child(cameraID).once("value", function(camData)
				{
					if (camData.val() != null)
					{
						trafficCamDesc = camData.val();	
						resolve('QueryFound');
					}	
				});
			});
			let timeout = new Promise(function(resolve, reject){
				setTimeout(function(){ resolve("TimeOut"); }, 4000);
			});

			Promise.race([queryPromise,timeout]).then(function(value)
			{
				if(value =="TimeOut")
				{
					res.send({"fulfillmentText": "An error occured in the server, try again later"});
				}
			});
			
			let utime = req.body.queryResult.parameters.time;
			let udateperiod = req.body.queryResult.parameters.dateperiod;
			let udate = req.body.queryResult.parameters.date;
			let utimeperiod = req.body.queryResult.parameters.timeperiod;
			let requestURL;
			let rYear;
			let rMonthIndex;
			let rDate;
			let rHour;
			let rMinute;
			if(utime.length != 0 || udate.length != 0 || udateperiod.length != 0 ||  utimeperiod.length != 0)
			{
				if (utimeperiod.startTime != null)
				{
					rMinute = new Date(Date.parse(utimeperiod.startTime)).getMinutes();
					rHour = new Date(Date.parse(utimeperiod.startTime)).getHours();
				}
				else if (utime.length != 0)
				{
					rMinute = new Date(Date.parse(utime)).getMinutes();
					rHour = new Date(Date.parse(utime)).getHours();			
				}
				else 
				{
					rMinute = new Date().getMinutes();
					rHour = new Date().getHours();
				}
				
				if (udateperiod.startDate != null)
				{
					rYear = new Date(Date.parse(udateperiod.startDate)).getFullYear();
					rMonthIndex = new Date(Date.parse(udateperiod.startDate)).getMonth();
					rDate = new Date(Date.parse(udateperiod.startDate)).getDate();
				}
				else if (udate.length != 0)
				{
					rYear = new Date(Date.parse(udate)).getFullYear();
					rMonthIndex = new Date(Date.parse(udate)).getMonth();
					rDate = new Date(Date.parse(udate)).getDate();	
				}
				else 
				{
					rYear = new Date().getFullYear();
					rMonthIndex = new Date().getMonth();
					rDate = new Date().getDate();
				}
				console.log(rYear+" " + rMonthIndex+ " " + rDate+ " " + rHour+ " " + rMinute);
				rDateTime = new Date(rYear,rMonthIndex,rDate,rHour,rMinute);
				if (rDateTime < new Date())
				{
					rDateTime.setHours(rDateTime.getHours() + 8);
					rDateTime = rDateTime.toISOString().slice(0,-5);
					requestURL = 'https://api.data.gov.sg/v1/transport/traffic-images?date_time='+rDateTime;
				}
				else
				{
					requestURL = 'https://api.data.gov.sg/v1/transport/traffic-images';
				}

			}
			else
			{
				requestURL = 'https://api.data.gov.sg/v1/transport/traffic-images';
			}
			
			let request = require('request');
			let resultJson;
			let imageTimeStamp;
			let imageURL;
			let foundImage = false;
			let requestPromise = new Promise(function(resolve, reject)
			{
				request(requestURL,function(error, response, body)
				{
					console.log('error:', error);
					if(response.statusCode == 200)
					{
						resultJson = JSON.parse(body);
						let cameraLength = resultJson.items[0].cameras.length;
						for (let i = 0; i < cameraLength; i++)
						{
							if (resultJson.items[0].cameras[i].camera_id == cameraID)
							{
								imageURL = resultJson.items[0].cameras[i]["image"];
								imageTimeStamp = resultJson.items[0].cameras[i].timestamp;
								foundImage = true;
								break;
							}
						}
					}
					else
					{
						res.send({"fulfillmentText": "Unable to reach traffic image server / issue with timing."})
						resolve('unable to reach endpoint');
					}
					if (foundImage == false)
					{
						res.send({"fulfillmentText": "Traffic image temporarily unavailable, try another an earlier timing or try again later."})
						resolve('not found');
					}
					else
					{
						res.send(JSON.stringify
						({"fulfillmentMessages":
							[{
								"card": 
								{
									"title": trafficCamDesc,
									"subtitle": imageTimeStamp,
									"imageUri": imageURL
								}
							}]
						}));
						resolve('found');
					}
				});	

			});
			
			let timeout1 = new Promise(function(resolve, reject){
				setTimeout(function(){ resolve("TimeOut"); }, 4000);
			});

			Promise.race([requestPromise,timeout1]).then(function(value)
			{
				if(value =="TimeOut")
				{
					res.send({"fulfillmentText": "An error occured in the server, try again later"});
				}
			});
		}
		catch(e)
		{
			console.log(e);
			res.send({"fulfillmentText": `An error occured in the server, while trying to query for traffic image for date ${rDateTime}. Error has been logged.`});
		}
	}
});

var listener = app.listen(process.env.PORT,process.env.IP,function(){
	console.log("server has started");
	 console.log('Listening on port ' + listener.address().port);
});

var WebSocketServer = require('websocket').server;
var http = require('http');
var winston = require('winston');  //Log를 위한 라이브러리
var logger = new (winston.Logger)({
    // 아래에서 설명할 여러개의 transport를 추가할 수 있다.
    transports: [
        // Console transport 추가
        new (winston.transports.Console)(),

        // File transport 추가
    new (winston.transports.File)({
           // filename property 지정
           filename: 'websocket.log',
		   maxsize: 10485760,
		   maxFiles: 5
    })
    ]
});

var websocketPort = 9001;

// latest 100 messages
var history = [ ];
// list of currently connected clients (users)
var clients = [ ];
	 
var server = http.createServer(function(request, response) {
	    console.log((new Date()) + ' Received request for ' + request.url);
	    response.writeHead(404);
	    response.end();
	});
	//서버 웹 소켓 포트 지정...
	server.listen(websocketPort, function() {
	    console.log((new Date()) + ' Server is listening on port '+websocketPort);
		logger.log('info', 'Websocket Server Start...');
	});
	 
	wsServer = new WebSocketServer({
	    httpServer: server,
	    // You should not use autoAcceptConnections for production
	    // applications, as it defeats all standard cross-origin protection
	    // facilities built into the protocol and the browser.  You should
	    // *always* verify the connection's origin and decide whether or not
	    // to accept it.
	    autoAcceptConnections: false
	});
	 
	function originIsAllowed(origin) {
	  // put logic here to detect whether the specified origin is allowed.
	  console.log("Connect Request : "+origin);
	  //if(origin == 'null')return false;
	  return true;
	}
	 
	wsServer.on('request', function(request) {
		//접속하는 ID로 사용
		var date = new Date();
		var idx = date.getTime()+Math.floor(Math.random() * 100000) + 1;
		//연동되는 ID. 웹 소켓 서버에 연동된 세션 중 동일한 syncId를 가지면 서로 데이터를 주고 받을 수 있게 한다.
		var syncId = null;
		
	    if (!originIsAllowed(request.origin)) {
	      // Make sure we only accept requests from an allowed origin
	      request.reject();
	      console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
	      return;
	    }
	 
	    var connection = request.accept(null, request.origin);
		//최초 연결이 성공하면, clients에 입력되고 차후 다른 부분을 입력 시 사용함.
		var index = clients.push(connection) - 1;
		clients[index].idx = idx;
		console.log('Insert Index >>>>>>>>>>>>>>>>>>>>>>> '+index);
		
	    logger.log('info','Connection accepted : '+request.origin+", RemoteAddress : "+connection.remoteAddress);
		
	    connection.on('message', function(message) {
	        if (message.type === 'utf8') {
	            //console.log(connection.remoteAddress+':::Received Message: ' + message.utf8Data);
				
				//배열에 Log 남기는 부분
				var obj = {
                    time: (new Date()).getTime(),
                    text: message.utf8Data,
                    connection: connection.remoteAddress,
                };
                history.push(obj);
                history = history.slice(-100);
				//console.log('response Data: ', message.utf8Data);
				try {
					var json = JSON.parse(message.utf8Data);
				} catch (e) {
					console.log('This doesn\'t look like a valid JSON: ', message.utf8Data);
					return;
				}
				console.log(idx + ' >>> ', json);
				
				if(json.type == 'login'){
					//최초 로그인 시 
					syncId = json.data;
					//clients는 일반 저장 배열이기 때문에 클래스가 연동 되지 않음.
					//즉, 변경 시 다시 값을 넣어줘야 함.
					for (var i=0; i < clients.length; i++) {
						if(clients[i].idx == idx){
							clients[i].syncId = json.data;
							break;
						}
					}
					
					logger.log('info', idx+', '+syncId+' member Entered...');
					
				}else if(json.type == 'data'){
					var counter = 0;
					for (var i=0; i < clients.length; i++) {
						//자신을 제외한 syncId가 같은 곳으로 데이터를 전송
						if(clients[i].idx != idx && clients[i].syncId == syncId){
							clients[i].sendUTF(message.utf8Data);
							console.log(clients[i].remoteAddress+'['+clients[i].index+'] Push Data: ['+json.data+']['+i+']');
							counter++;
						}
					}
					if(counter !=0){
						connection.sendUTF(JSON.stringify( { type: 'response', responseCode:'000',data: 'Done.'} ));
						logger.log('info', '['+connection.remoteAddress+']'+syncId+' >>> '+message.utf8Data);
					}else{ // 전송할 인원이 없을 경우
						connection.sendUTF(JSON.stringify( { type: 'response', responseCode:'001',data: 'ERR >>> No Matching Member...'} ));
						logger.log('info', '['+connection.remoteAddress+']'+syncId+' >>> ERR >>> No Matching Member...');
					}
					
				}else if(json.type == 'history'){
					console.log('response Data: history');
					if (history.length > 0) {
						connection.sendUTF(JSON.stringify( { type: 'response', responseCode:'000',data: history} ));
						logger.log('info', '['+connection.remoteAddress+']'+syncId+' >>> '+message.utf8Data);
					}
				}else if(json.type == 'clients'){
					console.log('response Data: history');
					if (clients.length > 0) {
						connection.sendUTF(JSON.stringify( { type: 'response', responseCode:'000',data: clients.length} ));
						logger.log('info', '['+connection.remoteAddress+']'+syncId+' >>> '+message.utf8Data);
					}
				}else{
					connection.sendUTF(JSON.stringify( { type: 'response', responseCode:'002',data: 'ERR >>> keep API Rule...'} ));
					logger.log('info', '['+connection.remoteAddress+']'+syncId+' >>> ERR >>> keep API Rule...');
				}
	        }
	        else if (message.type === 'binary') {
	            console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
	            connection.sendBytes(message.binaryData);
	        }
	    });
	    connection.on('close', function(reasonCode, description) {
			
			for (var i=0; i < clients.length; i++) {
				if(clients[i].idx == idx){
				//i 위치부터 1개만 지움. 즉 접속 해지한 녀석만 삭제
					clients.splice(i, 1)
					break;
				}
			}
	        console.log((new Date()) + ' Peer '+idx+' Member' + connection.remoteAddress + ' disconnected.');
			
	    });
	});
	

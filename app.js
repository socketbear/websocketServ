var WebSocketServer = require('websocket').server;
var http = require('http');
var winston = require('winston');  //Log�� ���� ���̺귯��
var logger = new (winston.Logger)({
    // �Ʒ����� ������ �������� transport�� �߰��� �� �ִ�.
    transports: [
        // Console transport �߰�
        new (winston.transports.Console)(),

        // File transport �߰�
    new (winston.transports.File)({
           // filename property ����
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
	//���� �� ���� ��Ʈ ����...
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
		//�����ϴ� ID�� ���
		var date = new Date();
		var idx = date.getTime()+Math.floor(Math.random() * 100000) + 1;
		//�����Ǵ� ID. �� ���� ������ ������ ���� �� ������ syncId�� ������ ���� �����͸� �ְ� ���� �� �ְ� �Ѵ�.
		var syncId = null;
		
	    if (!originIsAllowed(request.origin)) {
	      // Make sure we only accept requests from an allowed origin
	      request.reject();
	      console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
	      return;
	    }
	 
	    var connection = request.accept(null, request.origin);
		//���� ������ �����ϸ�, clients�� �Էµǰ� ���� �ٸ� �κ��� �Է� �� �����.
		var index = clients.push(connection) - 1;
		clients[index].idx = idx;
		console.log('Insert Index >>>>>>>>>>>>>>>>>>>>>>> '+index);
		
	    logger.log('info','Connection accepted : '+request.origin+", RemoteAddress : "+connection.remoteAddress);
		
	    connection.on('message', function(message) {
	        if (message.type === 'utf8') {
	            //console.log(connection.remoteAddress+':::Received Message: ' + message.utf8Data);
				
				//�迭�� Log ����� �κ�
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
					//���� �α��� �� 
					syncId = json.data;
					//clients�� �Ϲ� ���� �迭�̱� ������ Ŭ������ ���� ���� ����.
					//��, ���� �� �ٽ� ���� �־���� ��.
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
						//�ڽ��� ������ syncId�� ���� ������ �����͸� ����
						if(clients[i].idx != idx && clients[i].syncId == syncId){
							clients[i].sendUTF(message.utf8Data);
							console.log(clients[i].remoteAddress+'['+clients[i].index+'] Push Data: ['+json.data+']['+i+']');
							counter++;
						}
					}
					if(counter !=0){
						connection.sendUTF(JSON.stringify( { type: 'response', responseCode:'000',data: 'Done.'} ));
						logger.log('info', '['+connection.remoteAddress+']'+syncId+' >>> '+message.utf8Data);
					}else{ // ������ �ο��� ���� ���
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
				//i ��ġ���� 1���� ����. �� ���� ������ �༮�� ����
					clients.splice(i, 1)
					break;
				}
			}
	        console.log((new Date()) + ' Peer '+idx+' Member' + connection.remoteAddress + ' disconnected.');
			
	    });
	});
	

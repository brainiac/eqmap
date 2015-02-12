
// ----------------------------------------------------------------------
// websocket connection class

var EQEmuConnection = function(callback) {
    this._token = 'c5b80ec8-4174-4c4c-d332-dbf3c3a551fc';
    this._port  = 9082;
    this._socket = undefined;

    this.totalBytesReceived = 0;
    this.zoneServerCount = 0;
    this.totalPlayers = 0;
    this.zoneInfo = [];

    this.callback = callback;
    this.spawns = {}; // spawns by id
}

EQEmuConnection.prototype.createConnectionString = function() {
    var location = window.location, scheme;
    if (location.protocol === 'https:')
        scheme = 'wss:';
    else
        scheme = 'ws:';

    return scheme + '//' + window.location.hostname + ':' + this._port;
}

EQEmuConnection.prototype.connect = function() {
    var self = this;
    this._socketUrl = this.createConnectionString();
    this._socket = new WebSocket(this._socketUrl, 'eqemu');
    this._socket.onopen = function() { self._onSocketOpen() };
    this._socket.onerror = function(e) { self._onSocketError(e); };
    this._socket.onmessage = function(e) { self._onSocketMessage(e); };
}

EQEmuConnection.prototype.sendMessage = function(message) {
    var jsonstring = JSON.stringify(message);
    //console.log('sending: ' + jsonstring);
    this._socket.send(jsonstring);
}

EQEmuConnection.prototype._onSocketOpen = function() {
    console.log('Connection opened to ' + this._socketUrl);

    // send auth token
    var msg = {
        id: 'id_token_auth',
        method: 'WebInterface.Authorize',
        params: [this._token]
    };
    this.sendMessage(msg);
}

EQEmuConnection.prototype._onSocketError = function(error) {
    console.log('WebSocket error: ' + error);
}

EQEmuConnection.prototype._onSocketMessage = function(e) {
    var isJson = true;
    try {
        //console.log('received: ' + e);
        var json = $.parseJSON(e.data);
    }
    catch (err) {
        isJson = false;
    }

    if (isJson) {
        // Update Bytes Recieved
        this.totalBytesReceived += roughSizeOfObject(json);

        switch (json.id) {
        case 'id_token_auth':
            var msg = {
                id: 'id_list_zones',
                method: 'World.ListZones',
                params: []
            };
            this.sendMessage(msg);
            break;

        case 'id_list_zones':
            this.handleZoneList(json);
            break;

        case 'id_get_zoneInfo':
            this.handleZoneInfo(json);
            break;

        case 'id_subscribe':
            // do nothing
            break;

        case 'id_get_initial_entity_positions':
            this.handleInitialPositions(json);
            break;

        default:
            switch (json.method) {
            case 'On.NPC.Position':
                this.handleNPCPositionUpdate(json);
                break;

            case 'On.Client.Position':
                this.handleClientPositionUpdate(json);
                break;

            default:
                console.log('Unhandled response: ' + json.id + ' method:' + json.method);
                break;
            }
            break;
        }

/*
        // Tests
        if (json.id == 'quest_get_script') {
            // console.log(json);
            // $('.page-content').html('<textarea style="width:250%;height:800px">' + json.result.quest_text + '</textarea>');
        }

        // Event Handlers: Server -> Web Client
        if (json.method == 'On.NPC.Position' || json.method == 'On.Client.Position' || json.id == 'get_initial_entity_positions') {
            OnPositionUpdate(json);
        }

        if (json.method == 'On.Entity.Events') { OnEntityEvent(json); }
        else if (json.method == 'On.Combat.States') { OnClientCombatState(json); }
        else if (json.method == 'On.NPC.Depop') { OnNPCDepop(json);    }
        else if (json.id == 'zone_get_entity_attributes'){ HandleSideBarShowEntCallBack(json); }*/
    }
}

EQEmuConnection.prototype.handleZoneList = function(jsonData) {
    // server response with list of zones
    // looks something like this:
    // {"id":"id_list_zones","error":null,"result":{"0":"13","1":"12","2":"11","3":"10","4":"9"}}
    var data = jsonData.result;
    this.zoneServerCount = 0;
    this.totalPlayers = 0;
    this.zoneInfo = [];

    for (var key in data) {
        // parse int, as id is returned as a string
        var zoneId = parseInt(data[key]);
        var msg = {
            id: 'id_get_zoneInfo',
            method: 'World.GetZoneDetails',
            params: [zoneId.toString()]
        };
        this.sendMessage(msg);
        this.zoneServerCount++;
    }
}

EQEmuConnection.prototype.handleZoneInfo = function(jsonData) {
    // server response to request for individual zone info
    // looks something like this:
    // {"id":"id_get_zoneInfo","error":null,"result":{"instance_id":"0","launch_name":"zone",
    // "launched_name":"dynamic_03","long_name":"","player_count":"0","port":"7002","short_name":"",
    // "type":"dynamic","zone_id":"0"}}
    var data = jsonData.result;

    if (data['player_count'] > 0) {
        this.totalPlayers += parseInt(data['player_count']);
    }
    if (data['long_name'] == "") {
        data['long_name'] = "Sleeping";
    }

    if (data['short_name'] != "") {
        console.log('looking at: ' + data['short_name']);
        loadMap(data['short_name']);
        this.subscribeZoneEvents(data['short_name'], parseInt(data['zone_id']), parseInt(data['instance_id']));
    }

    this.zoneInfo.push(data);
    //$('#zone_servers_list tr:last').after('<tr><td style="text-align:center"><button type="button" class="btn btn-default btn-block" onclick="ProcessZoneView(\'' + r['short_name'] + '\', \'' + r['zone_id'] + '\', \'' + r['instance_id'] + '\')">' + r['long_name'] + ' (' + r['type'] + ')</button></td><td> <i class="fa fa-users"></i> ' + r['player_count'] + '</td><td>' + r['port'] + '</td><td>' + r['short_name'] + '</td><td>' + r['zone_id'] + '<td>' + r['instance_id'] + '</td></td></tr>');
}

EQEmuConnection.prototype.subscribeZone = function(zoneId, instanceId, registration) {
    this.sendMessage({
        id: 'id_subscribe',
        method: 'Zone.Subscribe',
        params: [zoneId.toString(), instanceId.toString(), registration]
    });
}

EQEmuConnection.prototype.subscribeZoneEvents = function(zoneShortName, zoneId, instanceId) {
    if (zoneShortName == "")
        return;
    this.zoneId = zoneId;
    this.instanceId = instanceId;

    // todo: load map

    this.subscribeZone(zoneId, instanceId, 'NPC.Depop');
    this.subscribeZone(zoneId, instanceId, 'NPC.Position');
    this.subscribeZone(zoneId, instanceId, 'Client.Position');
    this.subscribeZone(zoneId, instanceId, 'Combat.States');
    this.subscribeZone(zoneId, instanceId, 'Entity.Events');

    // grat initial entity positions
    this.sendMessage({
        id: 'id_get_initial_entity_positions',
        method: 'Zone.GetInitialEntityPositions',
        params: [zoneId.toString(), instanceId.toString()]
    });

    console.log('Loading map: ' + zoneShortName);
}

function createSpawnFromInitialData(data) {
    var spawn = new Object;
    spawn.type = data["type"];
    spawn.id = parseInt(data["ent_id"]);
    spawn.name = data["name"];
    spawn.x = parseFloat(data["x"]);
    spawn.y = parseFloat(data["y"]);
    spawn.z = parseFloat(data["z"]);
    spawn.heading = parseFloat(data["h"]);

    if (spawn.type === "NPC"
            || spawn.type === "Client"
            || spawn.type === "Corpse") {
        spawn.raceId = parseInt(data["race_id"]);
        spawn.classId = parseInt(data["class_id"]);
    }
    if (spawn.type === "NPC") {
        spawn.aggroRange = parseFloat(data["aggro_range"]);
    }

    return spawn;
}

EQEmuConnection.prototype.handleInitialPositions = function(jsonData) {
    var spawn = createSpawnFromInitialData(jsonData["result"]);
    this.spawns[spawn.spawnId] = spawn;

    if (this.callback !== undefined && this.callback.addSpawn !== undefined) {
        this.callback.addSpawn(spawn);
    }
}

EQEmuConnection.prototype.handleNPCPositionUpdate = function(jsonData) {
    var result = jsonData["params"];

    var spawnId = parseInt(result[0]);
    var name = result[1];
    var x = parseFloat(result[2]);
    var y = parseFloat(result[3]);
    var z = parseFloat(result[4]);
    var heading = parseFloat(result[5]);
    var classId = parseInt(result[6]);
    var raceId = parseInt(result[7]);

    var spawn = this.spawns[spawnId] || new Object;
    spawn.id = spawnId;
    spawn.name = name;
    spawn.x = -x;
    spawn.y = -y;
    spawn.z = z;
    spawn.heading = heading;
    spawn.classId = classId;
    spawn.raceId = raceId
    this.spawns[spawnId] = spawn;

    if (this.callback !== undefined && this.callback.updateSpawn !== undefined) {
        this.callback.updateSpawn(spawn);
    }
}

EQEmuConnection.prototype.handleClientPositionUpdate = function(jsonData) {
    this.handleNPCPositionUpdate(jsonData);
}

//---------------------------------------------------------------------------------------------
var theConn;

function startSockets() {
    theConn = new EQEmuConnection(theMap);
    theConn.connect();
}

function roughSizeOfObject(object) {
    var objectList = [];
    var stack = [object];
    var bytes = 0;
    while (stack.length) {
        var value = stack.pop();
        if (typeof value === 'boolean') {
            bytes += 4;
        }
        else if (typeof value === 'string') {
            bytes += value.length * 2;
        }
        else if (typeof value === 'number') {
            bytes += 8;
        }
        else if (typeof value === 'object' && objectList.indexOf(value) === -1) {
            objectList.push(value);
            for (var i in value) {
                stack.push(value[i]);
            }
        }
    }
    return bytes;
}
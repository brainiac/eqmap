function componentToHex(c) {
    c = typeof(c) === "string" ? parseInt(c) : c;
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(r, g, b) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function createPoint(x, y) {
    return L.latLng(
        (typeof(x) === "string" ? parseFloat(x) : x) / 1000.0,
        (typeof(y) === "string" ? parseFloat(y) : y) / 1000.0);
}

//------------------------------------------------------------------------------

var MapObject = function(mapId) {
    this.map = L.map(mapId);
    this.layers = [];
}

MapObject.prototype.fitView = function() {
    this.map.fitBounds(L.latLngBounds(
        L.latLng(-2, -2), L.latLng(1, 2)));
    this.map.setZoom(9);
}

MapObject.prototype.getMap = function() {
    return this.map;
}

MapObject.prototype.loadMapLayer = function(filename) {
    var obj = this;

    // creates a layerGroup given the contents from the map filename
    processMapData = function(data) {
        var layerGroup = L.layerGroup();

        // lines grouped by color
        var linesByColor = {};

        // iterate over lines, parse each for a line or a point label
        var linesText = data.match(/[^\r\n]+/g);
        for (var lineIndex = 0; lineIndex < linesText.length; lineIndex++)
        {
            var pieces = linesText[lineIndex].split(/\s+/);

            // a line
            if (pieces[0] == 'L') {
                // when we create lines, we group them by color to reduce the number
                // of layer objects that we end up creating.
                var p = [createPoint(pieces[1], pieces[2]),
                         createPoint(pieces[4], pieces[5])];
                var c = rgbToHex(pieces[7], pieces[8], pieces[9]);

                if (!(c in linesByColor)) {
                    linesByColor[c] = Array();
                }
                linesByColor[c].push(p);
            }
            else if (pieces[0] == 'P') {
                // a point label
                /*
                var p = L.latLng(parseFloat(pieces[1]) / 1000.0, parseFloat(pieces[2]) / 1000.0);

                var l = new L.Label()
                l.setcontent(pieces[8]);
                l.setLatLng(p);
                map.showLabel(l);*/
            }
        }

        for (var color in linesByColor) {
            var lines = L.multiPolyline(linesByColor[color], {
                color: color,
                opacity: 1.0,
                weight: 1
            });
            //layerGroup.addLayer(lines);

            lines.addTo(obj.map);
        }

        //layerGroup.addTo(obj.map);
    }

    $.ajax({
        type: 'GET',
        url: 'maps/' + filename + '.txt',
        dataType: 'text',
        success: processMapData,
        error: function(xhr, status, errorThrown) {
            console.log("failed to fetch map: " + filename);
            console.dir([xhr, status, errorThrown]);
        }
    })
}

var theMap;

function begin()
{
    theMap = new MapObject('map');
    theMap.loadMapLayer('poknowledge');
    theMap.fitView();
}
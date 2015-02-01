
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
        (typeof(y) === "string" ? -parseFloat(y) : -y),
        (typeof(x) === "string" ? parseFloat(x) : x));
}

function createLabel(point, text) {
    text = text.replace("_", " ");
   var icon = L.divIcon({
        className: 'point-circle',
        html: text,
        iconSize: [2, 2]
    });

    return L.marker(point, {icon: icon, title: text});
}

function unionBounds(bounds1, bounds2) {
    return [
        Math.min(bounds1[0], bounds2[0]),
        Math.min(bounds1[1], bounds2[1]),
        Math.max(bounds1[2], bounds2[2]),
        Math.max(bounds1[3], bounds2[3]),
    ];
}

L.Control.Loader = L.Control.extend({
    onAdd: function(map) {
        this._map = map;
        this._container = L.DomUtil.create('div','leaflet-control-loader');
        this.hide();
        return this._container;
    },
    addTo: function(map) {
        this._container = this.onAdd(map);
        map.getContainer().appendChild(this._container);
        return this;
    },
    show: function() {
        this._container.style.display = 'block';
        return this;
    },
    hide: function() {
        this._container.style.display = 'none';
        return this;
    }
});

L.Map.addInitHook(function () {
    if (this.options.loaderControl) {
        this.loaderControl = L.control.loader(this.options.loaderControl);
        this.addControl(this.loaderControl);
    }
});

L.control.loader = function(options) {
    return new L.Control.Loader(options);
};

//------------------------------------------------------------------------------

var MapObject = function(mapId) {
    this.map = L.map(mapId, {
        crs: L.CRS.Simple,
        zoom: 0,
        minZoom: -5
    });
    this.layers = [];
    this.bounds = [0, 0, 0, 0];

    L.control.mousePosition({
        separator: ", ",
        latFormatter: function(l) { return (l).toFixed(2) },
        lngFormatter: function(l) { return (-l).toFixed(2) },
    }).addTo(this.map);

    this.graticule = L.simpleGraticule({
        interval: 100,
        showOriginLabel: true,
        showLabels: false,
        redraw: 'moveend'
    })
    this.graticule.addTo(this.map);

    var sidebar = L.control.sidebar('sidebar').addTo(this.map);

    this.loaderControl = L.control.loader().addTo(this.map);
}

MapObject.prototype.fitView = function() {
    this.map.fitBounds([
        [this.bounds[0], this.bounds[1]],
        [this.bounds[2], this.bounds[3]]
    ]);
    var center = [(this.bounds[0] + this.bounds[2]) / 2,
        (this.bounds[3] + this.bounds[1]) / 2];
    this.map.panTo(center);
}

MapObject.prototype.getMap = function() {
    return this.map;
}

MapObject.prototype.addMapLayers = function(layers, bounds) {
    // layers is a dictionary of names and layers
    if (this.layersControl) {
        this.map.removeControl(this.layersControl);
    }
    this.layersControl = null;

    for (var l in this.layers) {
        this.map.removeLayer(l);
    }
    this.layers = [];

    var foundContent = false;
    for (var layerName in layers) {
        var layer = layers[layerName];
        if (layer.getLayers().length > 0 && !foundContent) {
            this.map.addLayer(layer);
            foundContent = true;
        }
        this.layers.push(layer);
    }

    this.bounds = unionBounds(this.bounds, bounds);

    this.layersControl = L.control.layers([], layers, {collapsed: false});
    this.layersControl.addTo(this.map);

    this.fitView();
}

MapObject.prototype.clearMap = function() {
    for (var i = 0; i < this.layers.length; i++) {
        var layer = this.layers[i];
        this.map.removeLayer(layer);
        this.layersControl.removeLayer(layer);
    }
    this.layers = [];
    if (this.layersControl) {
        this.map.removeControl(this.layersControl);
        this.layersControl = null;
    }

    this.bounds = [0, 0, 0, 0];
}

MapObject.prototype.loadMapLayer = function(filename) {
    var obj = this;

    this.clearMap();

    // creates a layerGroup given the contents from the map filename
    processMapData = function(data) {
        var layerGroup = L.layerGroup();

        // lines grouped by color
        var linesByColor = {};
        var bounds = [0, 0, 0, 0];

        if (data.length === 0) {
            return [layerGroup, bounds];
        }

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
                bounds = [
                    Math.min(bounds[0], p[0].lat, p[1].lat),
                    Math.min(bounds[1], p[0].lng, p[1].lng),
                    Math.max(bounds[2], p[0].lat, p[1].lat),
                    Math.max(bounds[3], p[0].lng, p[1].lng),
                ];

                if (!(c in linesByColor)) {
                    linesByColor[c] = Array();
                }
                linesByColor[c].push(p);
            }
            else if (pieces[0] == 'P') {
                var label = createLabel(createPoint(pieces[1], pieces[2]), pieces[8]);
                layerGroup.addLayer(label);
            }
        }

        for (var color in linesByColor) {
            var lines = L.multiPolyline(linesByColor[color], {
                color: color,
                opacity: 1.0,
                weight: 1
            });
            layerGroup.addLayer(lines);
        }

        return [layerGroup, bounds];
    }

    // each map has a base and 3 layers
    maps = {"0": filename,
        "1": filename + "_1",
        "2": filename + "_2",
        "3": filename + "_3"
    };
    var completeCb = {
        layers: {},
        bounds: {},
        object: obj,
        remaining: 4,

        complete: function() {
            --this.remaining;
            if (this.remaining == 0) {
                console.log("done!");

                // aggregate the bounds
                var bounds = [0, 0, 0, 0];
                for (var k in this.bounds) {
                    bounds = unionBounds(bounds, this.bounds[k]);
                }
                this.object.loaderControl.hide();
                this.object.addMapLayers(this.layers, bounds);
            }
        }
    };

    this.loaderControl.show();

    for (var k in maps) {
        var success = (function(k, v) {
            return function(data) {
                var layerGroup = processMapData(data);

                completeCb.layers[k] = layerGroup[0];
                completeCb.bounds[k] = layerGroup[1];
                completeCb.complete();
            };
        })(k, maps[k]);

        $.ajax({
            type: 'GET',
            url: 'maps/' + maps[k] + '.txt',
            dataType: 'text',
            success: success,
            error: function(xhr, status, errorThrown) {
                console.dir([xhr, status, errorThrown]);
                completeCb.complete();
            }
        });
    }
}

var theMap;

function begin()
{
    theMap = new MapObject('map');

    var loadMap = function(name) {
        console.log("load: " + name);
        theMap.loadMapLayer(name);
    }

    var createMapList = function(data) {
        var mapList = $('#map-list');
        for (var k in data) {
            (function(k, v) {
                var mapName = v;
                $('<li/>', {
                    'id': 'map-load-' + k,
                    'class': 'map-list-element',
                    'html': mapName,
                    'click': function() { loadMap(mapName); }
                }).appendTo(mapList);
            })(k, data[k]);
        }
    };

    // load list of maps
    $.ajax({
        type: 'GET',
        url: 'maps.php',
        dataType: 'json',
        success: createMapList,
        error: function(xhr, status, errorThrown) {
            console.dir([xhr, status, errorThrown]);
        }
    });
}
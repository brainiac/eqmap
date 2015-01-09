var SCALE_FACTOR = 1000.0;

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
        (typeof(x) === "string" ? parseFloat(x) : x) / SCALE_FACTOR,
        (typeof(y) === "string" ? parseFloat(y) : y) / SCALE_FACTOR);
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

function createGridLayer() {
    var lines = [];
    var d = 2, p = .1;
    for (var x = -d; x <= d + p; x += p) {
        lines.push([L.latLng(x, -d), L.latLng(x, d)]);
        lines.push([L.latLng(-d, x), L.latLng(d, x)]);
    }
    return L.multiPolyline(lines, {
        color: "#777",
        opacity: 0.5,
        weight: 1
    });
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
    this.map = L.map(mapId, {crs: L.CRS.Simple});
    this.layers = [];

    L.control.mousePosition({
        separator: ", ",
        latFormatter: function(l) { return (l*SCALE_FACTOR).toFixed(2) },
        lngFormatter: function(l) { return (l*SCALE_FACTOR).toFixed(2) }
    }).addTo(this.map);
    
    // Create grid and layer control
    var gridLayer = createGridLayer();
    gridLayer.addTo(this.map);

    gridLayer = {
        "Grid": gridLayer
    };
    L.control.layers([], gridLayer, {
        collapsed: false
    }).addTo(this.map);

    this.loaderControl = L.control.loader().addTo(this.map);
}

MapObject.prototype.fitView = function() {
    this.map.fitBounds(L.latLngBounds(
        L.latLng(-2000 / SCALE_FACTOR, -2000 / SCALE_FACTOR),
        L.latLng( 1000 / SCALE_FACTOR,  2000 / SCALE_FACTOR)));
    this.map.setZoom(9);
}

MapObject.prototype.getMap = function() {
    return this.map;
}

MapObject.prototype.addMapLayers = function(layers) {
    // layers is a dictionary of names and layers
    if (this.layersControl) {
        this.map.removeControl(this.layersControl);
    }
    this.layersControl = null;

    for (var l in this.layers) {
        this.map.removeLayer(l);
    }
    this.layers = [];

    for (var layerName in layers) {
        var layer = layers[layerName];
        if (layerName === "0")
            this.map.addLayer(layer);
        this.layers.push(layer);
    }

    this.layersControl = L.control.layers([], layers, {collapsed: false});
    this.layersControl.addTo(this.map);
}

MapObject.prototype.loadMapLayer = function(filename) {
    var obj = this;

    // todo: remove all map layers

    // creates a layerGroup given the contents from the map filename
    processMapData = function(data) {
        var layerGroup = L.layerGroup();

        // lines grouped by color
        var linesByColor = {};

        if (data.length === 0) {
            return layerGroup;
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

        return layerGroup;
    }

    // each map has a base and 3 layers
    maps = {"0": filename,
        "1": filename + "_1",
        "2": filename + "_2",
        "3": filename + "_3"
    };
    var completeCb = {
        layers: {},
        object: obj,
        remaining: 4,

        complete: function() {
            --this.remaining;
            if (this.remaining == 0) {
                console.log("done!");
                this.object.loaderControl.hide();
                this.object.addMapLayers(this.layers);
            }
        }
    };

    this.loaderControl.show();

    for (var k in maps) {
        var success = (function(k, v) {
            return function(data) {
                var layerGroup = processMapData(data);

                completeCb.layers[k] = layerGroup;
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
    theMap.loadMapLayer('poknowledge');
    theMap.fitView();
}
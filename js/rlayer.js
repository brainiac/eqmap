/*
 RaphaelLayer, a JavaScript library for overlaying Raphael objects onto Leaflet interactive maps. http://dynmeth.github.com/RaphaelLayer
 (c) 2012-2013, David Howell, Dynamic Methods Pty Ltd

 Version 0.3.3

 Fork by Arnooo: https://github.com/Arnooo/RaphaelLayer

*/

(function() {

var R, originalR;

if (typeof exports != 'undefined') {
	R = exports;
} else {
	R = {};

	originalR = window.R;

	R.noConflict = function() {
		window.R = originalR;
		return R;
	};

	window.R = R;
}

R.version = '0.3.3';

R.Layer = L.Class.extend({
    includes: L.Mixin.Events,
    
    initialize: function(options) {
        this.options = options;
    },

    update: function(options){
        this.options = options;
    },
    
    onAdd: function (map) {
        this._map = map;
        this._map._initRaphaelRoot();
        this._paper = this._map._paper;
        this._set = this._paper.set();
        
        map.on('viewreset', this.projectLatLngs, this);
        map.on('resize', this.projectLatLngs, this);
        this.projectLatLngs();
    },

    onRemove: function(map) {
        map.off('viewreset', this.projectLatLngs, this);
        map.off('resize', this.projectLatLngs, this);
        this._map = null;
        this._set.forEach(function(item) {
            item.remove();
        }, this);
        this._set.clear();
    },

    projectLatLngs: function() {
        
    },

    animate: function(attr, ms, easing, callback) {
        this._set.animate(attr, ms, easing, callback);
    
        return this;
    },

    hover: function(f_in, f_out, icontext, ocontext) {
        this._set.hover(f_in, f_out, icontext, ocontext);

        return this;
    },

    attr: function(name, value) {
        this._set.attr(name, value);

        return this;
    }
});

L.Map.include({
    _initRaphaelRoot: function () {
        if (!this._raphaelRoot) {
            this._raphaelRoot = this._panes.overlayPane;
            this._paper = Raphael(this._raphaelRoot);

            this.on('moveend', this._updateRaphaelViewport);
            this._updateRaphaelViewport();
        }
    },

    _updateRaphaelViewport: function () {
        var    p = L.Path.CLIP_PADDING,
            size = this.getSize(),
            panePos = L.DomUtil.getPosition(this._mapPane),
            min = panePos.multiplyBy(-1)._subtract(size.multiplyBy(p)),
            max = min.add(size.multiplyBy(1 + p*2)),
            width = max.x - min.x,
            height = max.y - min.y,
            root = this._raphaelRoot,
            pane = this._panes.overlayPane;

        this._paper.setSize(width, height);
        
        L.DomUtil.setPosition(root, min);

        root.setAttribute('width', width);
        root.setAttribute('height', height);
        
        this._paper.setViewBox(min.x, min.y, width, height, false);
        
    }
});

R.Marker = R.Layer.extend({
	initialize: function(latlng, pathString, attr, options) {
		R.Layer.prototype.initialize.call(this, options);

		this._latlng = latlng;
		this._pathString = (typeof pathString == 'string' ? pathString : 'M16,3.5c-4.142,0-7.5,3.358-7.5,7.5c0,4.143,7.5,18.121,7.5,18.121S23.5,15.143,23.5,11C23.5,6.858,20.143,3.5,16,3.5z M16,14.584c-1.979,0-3.584-1.604-3.584-3.584S14.021,7.416,16,7.416S19.584,9.021,19.584,11S17.979,14.584,16,14.584z');
		this._attr = (typeof pathString == 'object' ? pathString : (attr ? attr : {'fill': '#000'}));
	},

	projectLatLngs: function() {		
		if (this._path) this._path.remove();

		var p = this._map.latLngToLayerPoint(this._latlng);
		var r = Raphael.pathBBox(this._pathString);
		
		this._path = this._paper.path(this._pathString)
			.attr(this._attr)
			.translate(p.x - 1.05*r.width, p.y - 1.15*r.height)
			.toFront();

		this._set.push(this._path);
	}
});

R.Pulse = R.Layer.extend({
	initialize: function(latlng, radius, attr, pulseAttr, options) {
		R.Layer.prototype.initialize.call(this, options);

		this._latlng = latlng;
		this._radius = (typeof radius == 'number' ? radius : 6);
		this._attr = (typeof radius == 'object' ? radius : (typeof attr == 'object' ? attr : {'fill': '#30a3ec', 'stroke': '#30a3ec'}));
		this._pulseAttr = (typeof radius == 'object' ? attr : typeof pulseAttr == 'object' ? pulseAttr : {
			'stroke-width': 3,
			'stroke': this._attr.stroke
		});
		this._repeat = 3;
	},

	onRemove: function (map) {
		R.Layer.prototype.onRemove.call(this, map);

		if(this._marker) this._marker.remove();		
		if(this._pulse) this._pulse.remove();
	},

	projectLatLngs: function() {
		if(this._marker) this._marker.remove();
		if(this._pulse) this._pulse.remove();

		var p = this._map.latLngToLayerPoint(this._latlng);

		this._marker = this._paper.circle(p.x, p.y, this._radius).attr(this._attr);
		this._pulse = this._paper.circle(p.x, p.y, this._radius).attr(this._pulseAttr);

		var anim = Raphael.animation({
						'0%': {transform: 's0.3', opacity: 1.0},
						'100%': {transform: 's3.0', opacity: 0.0, easing: '<'}
					}, 1000);

		this._pulse.animate(anim.repeat(this._repeat));
	}
});

R.Polyline = R.Layer.extend({
	
	initialize: function(latlngs, attr, options) {
		R.Layer.prototype.initialize.call(this, options);

		this._latlngs = latlngs;
		this._attr = attr || {'fill': '#000', 'stroke': '#000'};
	},

	projectLatLngs: function() {
		this._set.clear();	
		if (this._path) this._path.remove();
		
		this._path = this._paper.path(this.getPathString())
			.attr(this._attr)
			.toBack();

		this._set.push(this._path);
	},

	getPathString: function() {
		for(var i=0, len=this._latlngs.length, str=''; i<len; i++) {
			var p = this._map.latLngToLayerPoint(this._latlngs[i]);
			str += (i ? 'L' : 'M') + p.x + ' ' + p.y;
		}
		return str;
	}
});

R.Polygon = R.Layer.extend({
	
	initialize: function(latlngs, attr, options) {
		R.Layer.prototype.initialize.call(this, options);

		if(latlngs.length == 1) {
			if(latlngs[0] instanceof Array) {
				latlngs = latlngs[0];
			}
		}

		this._latlngs = latlngs;
		this._attr = attr || {'fill': 'rgba(255, 0, 0, 0.5)', 'stroke': '#f00', 'stroke-width': 2};
	},

	projectLatLngs: function() {
		if (this._path) this._path.remove();
		
		this._path = this._paper.path(this.getPathString())
			.attr(this._attr)
			.toBack();

		this._set.push(this._path);
	},

	getPathString: function() {
		for(var i=0, len=this._latlngs.length, str=''; i<len; i++) {
			var p = this._map.latLngToLayerPoint(this._latlngs[i]);
			str += (i ? 'L' : 'M') + p.x + ' ' + p.y;
		}
		str += 'Z';

		return str;
	}
});

R.PolygonGlow = R.Layer.extend({
	initialize: function(latlngs, attr, options) {
		R.Layer.prototype.initialize.call(this, options);

		this._latlngs = latlngs;
		this._attr = attr || {'fill': 'rgba(255, 0, 0, 1)', 'stroke': '#f00', 'stroke-width': 3};
	},

	onRemove: function(map) {
		R.Layer.prototype.onRemove.call(this, map);
		
		if(this._path) this._path.remove();
	},

	projectLatLngs: function() {	
		if (this._path) this._path.remove();
		
		this._path = this._paper.path(this.getPathString())
			.attr(this._attr)
			.toBack();

		var p = this._path;

		var fadeIn = function() {
			p.animate({
				'fill-opacity': 0.25
			}, 1000, '<', fadeOut);
		};

		var fadeOut = function() {
			p.animate({
				'fill-opacity': 1
			}, 1000, '<', fadeIn);
		};

		fadeOut();
	},

	getPathString: function() {
		for(var i=0, len=this._latlngs.length, str=''; i<len; i++) {
			var p = this._map.latLngToLayerPoint(this._latlngs[i]);
			str += (i ? 'L' : 'M') + p.x + ' ' + p.y;
		}
		str += 'Z';

		return str;
	}
});

R.Bezier = R.Layer.extend({
	initialize: function(latlngs, attr, options) {
		R.Layer.prototype.initialize.call(this, options);

		this._latlngs = latlngs;
		this._attr = attr;
	},

	projectLatLngs: function() {
		if(this._path) this._path.remove();
		
		var start = this._map.latLngToLayerPoint(this._latlngs[0]),
			end = this._map.latLngToLayerPoint(this._latlngs[1]),
			cp = this.getControlPoint(start, end);

		this._path = this._paper.path('M' + start.x + ' ' + start.y + 'Q' + cp.x + ' ' + cp.y + ' ' + end.x + ' ' + end.y)
			.attr(this._attr)
			.toBack();

		this._set.push(this._path);
	},

	getControlPoint: function(start, end) {
		var cp = { x: 0, y: 0 };
		cp.x = start.x + (end.x - [start.x]) / 2;
		cp.y = start.y + (end.y - [start.y]) / 2;
		var amp = 0;

		if (this.closeTo(start.x, end.x) && !this.closeTo(start.y, end.y)) {
			amp = (start.x - end.x) * 1 + 15 * (start.x >= end.x ? 1 : -1);
			cp.x = Math.max(start.x, end.x) + amp;
		} else {
			amp = (end.y - start.y) * 1.5 + 15 * (start.y < end.y ? 1 : -1);
			cp.y = Math.min(start.y, end.y) + amp;
		}
		return cp;
	},

	closeTo: function(a, b) {
		var t = 15;
  		return (a - b > -t && a - b < t);
	}
});

R.BezierAnim = R.Layer.extend({
    initialize: function(latlngs, attr, cb, options) {
        R.Layer.prototype.initialize.call(this, options);

        this._latlngs = latlngs;
        if(attr){
            this._attr = attr;
        }
        else{
            this._attr = {stroke: "blue", "stroke-width": 4}
        }
        this._cb = cb;
        this._enablePathAnimation = true;
        this._enableMarkerAnimation = true;
        this._dataToSend = {};
    },
    update: function(data){
        R.Layer.prototype.update.call(this, data.objectOptions);
        this.initialize(data.markers, data.attribut, data.callbacks, data.objectOptions);
        this.projectLatLngs();
    },
    onRemove: function (map) {
        R.Layer.prototype.onRemove.call(this, map);
        this._reset();
    },
    projectLatLngs: function() {
        var self = this;
        self._reset();
        if(self._latlngs.length > 0){

            //Init sets
            self._setControls = self._paper.set();
            self._setMarkers = self._paper.set();

            //Parse all points
            for(var pointID = 0; pointID < self._latlngs.length; pointID++){
                var symetricPoint = false;
                var currentPoint = self._map.latLngToLayerPoint(self._latlngs[pointID]);
                if(pointID === 0){
                    self._arrayBezier.push("M");
                }
                else if(pointID > 0 && pointID%2 === 1) {
                    self._arrayBezier.push("S"); 
                }
                else if(pointID > 1){ 
                    var previousPoint = self._arrayBezier[self._arrayBezier.length - 1];
                    var tmp = currentPoint.subtract(previousPoint);
                    symetricPoint = currentPoint.add(tmp);
                }
                self._arrayBezier.push([currentPoint.x, currentPoint.y]);
                var controlID = self._addControlPoint(pointID, currentPoint); 
                self._addMarker(pointID, controlID);               
                if(symetricPoint){
                    self._addControlPoint(pointID - 1, symetricPoint); 
                }
            }
            //Convert array to path 
            self._pathBezier = self._paper.path(self._arrayBezier).hide();
            if(self.options && self.options.renderLastOnly && self._arrayBezier.length > 2){
                self._pathBezierFixed = self._paper.path(self._arrayBezier.slice(0, self._arrayBezier.length - 3));
                self._pathBezierFixed.attr(self._attr);
                self._startNormalized = self._pathBezierFixed.getTotalLength() / self._pathBezier.getTotalLength();
            }
            self._pathControls = self._paper.path(self._arrayControls);
            self._setControls.push(self._pathControls);

            //Set all attributs
            self._pathBezier.attr(self._attr);
            self._pathBezier.attr({"stroke-linecap": "round", cursor: "pointer"});
            self._pathControls.attr({stroke: "#000", "stroke-dasharray": "- "});

            //Reorder elements
            if(self.options && !self.options.editor){
                self._setControls.hide();
            }
            else{
                self._setControls.show();
                self._setControls.toFront();
                self._pathControls.toBack();
                self._setMarkers.toFront();
            }

            //Connect mouse event
            function move(dx, dy) {
                if(this.update){
                    this.update(dx - (this.dx || 0), dy - (this.dy || 0));
                    this.dx = dx; 
                    this.dy = dy;
                }
            };
            function up() {
                this.dx = this.dy = 0;
            }

            if(self.options && self.options.editor){
                self._setControls.drag(move, up);
                self._setMarkers.drag(move, up);
            }

            function hoverIn(){
                if(self._map){
                    self._map.dragging.disable();
                }
                if(self._cb && self._cb.onHoverControls){
                    self._cb.onHoverControls();
                }
            };
            function hoverOut(){
                if(self._map){
                    self._map.dragging.enable(); 
                }
                if(self._cb && self._cb.onDragControls){
                    self._cb.onDragControls(self._dataToSend);
                    self._dataToSend = {};
                }
            }
            self._setControls.hover(hoverIn, hoverOut);
            self._setMarkers.hover(hoverIn, hoverOut);
            self._pathBezier.click(function(){
                if(self._cb && self._cb.onClickPath && self.options.pathInfo){
                    self._cb.onClickPath(self.options.pathInfo);
                }
            });

            self._addAnimatedPath();
            self._addAnimatedMarker();
        }
    },
    _reset:function(){
        
        if(this._pathBezier) this._pathBezier.remove();
        if(this._pathControls) this._pathControls.remove();
        if(this._circleControls) this._circleControls.remove();
        if(this._setControls) this._setControls.remove();
        if(this._setMarkers) this._setMarkers.remove();
        if(this._pathBezierAnimated) this._pathBezierAnimated.remove();
        if(this._markerAnimated) this._markerAnimated.remove();
        if(this._pathBezierFixed) this._pathBezierFixed.remove();
        this._arrayBezier = [];
        this._arrayControls = [];
        this._startNormalized = 0;
    },
    _updateLatlngs:function(pointID, newLatlng){
        var self = this;
        if(pointID < self._latlngs.length){
            self._latlngs[pointID] = newLatlng;
            self.options.markers[pointID].latlng = newLatlng;
        }
    },
    _addControlPoint:function(pointID, currentPoint){
        var self = this;
        var controlID = self._setControls.length;
        if(pointID > 0){
            if(self._arrayControls.length % 3 === 0){
                self._arrayControls.push("M");
            }
            else{
                self._arrayControls.push("L");
            }
            self._arrayControls.push([currentPoint.x, currentPoint.y]); 
        }
        var circleElement = self._paper.circle(currentPoint.x, currentPoint.y, 5).attr({fill: "#fff", stroke: "#000", cursor:"pointer"});
        circleElement.data("pointID", pointID);
        circleElement.data("controlID", controlID);
        if(self.options && self.options.markersInfos){
            circleElement.data("info", self.options.markersInfos[pointID]);
        }
        self._setControls.push(circleElement);

        if(pointID === 0){
            circleElement.update = function (x, y) {
                var X = this.attr("cx") + x,
                    Y = this.attr("cy") + y;
                this.attr({cx: X, cy: Y});
                var currentPointID = this.data("pointID");
                var currentControlID = this.data("controlID");
                self._arrayBezier[1][0] = X;
                self._arrayBezier[1][1] = Y;
                var markerPosX = self._setMarkers[currentPointID].attr("x") + x;
                var markerPosY = self._setMarkers[currentPointID].attr("y") + y;
                self._setMarkers[currentPointID].attr({x: markerPosX, y: markerPosY});
                self._pathBezier.attr({path: self._arrayBezier});
                
                var latlng = self._map.layerPointToLatLng([X, Y]);
                self._dataToSend[currentControlID] =  { 
                    info : this.data("info"),
                    latlng : latlng
                };
            }; 
        } 
        else if(pointID > 0 && (self._arrayControls.length - 1) % 3 === 1){
            
            //MAIN BEZIER CONTROL!!!
            circleElement.update = function (x, y) {
                var X = this.attr("cx") + x,
                    Y = this.attr("cy") + y;
                this.attr({cx: X, cy: Y});
                var currentPointID = this.data("pointID");
                var index = Math.floor((currentPointID+1)/2) * 3;
                self._arrayBezier[index][0] = X;
                self._arrayBezier[index][1] = Y;
                self._pathBezier.attr({path: self._arrayBezier});
                
                var currentControlID = this.data("controlID");
                self._arrayControls[currentControlID * 2 -1][0] = X;
                self._arrayControls[currentControlID * 2 -1][1] = Y;
                self._pathControls.attr({path: self._arrayControls});
                
                self._setControls[currentControlID + 2].updatePosition(-x, -y);

                var latlng = self._map.layerPointToLatLng([X, Y]);
                self._dataToSend[currentControlID] =  { 
                    info : this.data("info"),
                    latlng : latlng
                };
            }; 
            
            circleElement.updatePosition = function (x, y) {
                var X = this.attr("cx") + x,
                    Y = this.attr("cy") + y;
                this.attr({cx: X, cy: Y});
                var currentControlID = this.data("controlID");
                self._arrayControls[currentControlID * 2 -1][0] = X;
                self._arrayControls[currentControlID * 2 -1][1] = Y;
                self._pathControls.attr({path: self._arrayControls});
                
                var currentPointID = this.data("pointID");
                var index = Math.floor((currentPointID+1)/2) * 3;
                self._arrayBezier[index][0] = X;
                self._arrayBezier[index][1] = Y;
                self._pathBezier.attr({path: self._arrayBezier});

                var latlng = self._map.layerPointToLatLng([X, Y]);
                self._dataToSend[currentControlID] =  { 
                    info : this.data("info"),
                    latlng : latlng
                };
            }; 
        }
        else if(pointID > 0 && self._arrayControls.length % 3 === 0){
            //SYMETRIC CONTROL!!!
            circleElement.update = function (x, y) {
                var X = this.attr("cx") + x,
                    Y = this.attr("cy") + y;
                this.attr({cx: X, cy: Y}); 
                var currentPointID = this.data("pointID");
                var currentControlID = this.data("controlID");
                var index = Math.floor((currentPointID+1)/2) * 3;
                self._pathBezier.attr({path: self._arrayBezier});
                
                self._arrayControls[currentControlID * 2 -1][0] = X;
                self._arrayControls[currentControlID * 2 -1][1] = Y;
                self._pathControls.attr({path: self._arrayControls});
                
                self._setControls[currentControlID - 2].updatePosition(-x, -y);
            }; 
            
            circleElement.updatePosition = function (x, y) {
                var X = this.attr("cx") + x,
                    Y = this.attr("cy") + y;
                this.attr({cx: X, cy: Y});
                var currentControlID = this.data("controlID");
                var currentPointID = this.data("pointID");
                var index = Math.floor((currentPointID+1)/2) * 3;
                self._arrayControls[currentControlID * 2 -1][0] = X;
                self._arrayControls[currentControlID * 2 -1][1] = Y;
                self._pathControls.attr({path: self._arrayControls});
            }; 
        }
        else if(pointID > 0 && (self._arrayControls.length - 1) % 3 === 0){
            //PATH CONTROL!!!
            circleElement.update = function (x, y) {
                var X = this.attr("cx") + x,
                    Y = this.attr("cy") + y;
                this.attr({cx: X, cy: Y});
                var currentPointID = this.data("pointID");
                var currentControlID = this.data("controlID");
                var index = 1 + Math.floor(currentPointID/2) * 3;
                self._arrayBezier[index][0] = X; 
                self._arrayBezier[index][1] = Y;
                
                var markerPosX = self._setMarkers[currentPointID].attr("x") + x;
                var markerPosY = self._setMarkers[currentPointID].attr("y") + y;
                self._setMarkers[currentPointID].attr({x: markerPosX, y: markerPosY});

                self._arrayControls[currentControlID * 2 -1][0] = X;
                self._arrayControls[currentControlID * 2 -1][1] = Y;
                self._setControls[currentControlID - 1].updatePosition(x, y); 
                self._setControls[currentControlID + 1].updatePosition(x, y);

                var latlng = self._map.layerPointToLatLng([X, Y]);
                self._dataToSend[currentControlID] =  { 
                    info : this.data("info"),
                    latlng : latlng
                };

                self._updateLatlngs(currentPointID, latlng);
            }; 
        }
        return controlID;
    },
    _addMarker: function(pointID, controlID){
        var self = this;
        if(self._setMarkers && 
            self.options &&
            self.options.markers && 
            self.options.markers[pointID]){
            var point = self._map.latLngToLayerPoint(self.options.markers[pointID].latlng);

            var element = null;
            if(self.options.markers[pointID].icon){
                element = self._paper.image(self.options.markers[pointID].icon.url, 
                                      point.x - self.options.markers[pointID].icon.anchor[0], 
                                      point.y - self.options.markers[pointID].icon.anchor[1], 
                                      self.options.markers[pointID].icon.size[0], 
                                      self.options.markers[pointID].icon.size[1]).show();
                element.attr({cursor:"pointer"});
                element.data("controlID", controlID);
                element.data("pointID", pointID);
                if(self.options.markersInfos){
                    element.data("info", self.options.markersInfos[pointID]);
                }
                element.update = function (x, y) {
                    var currentControlID = this.data("controlID");
                    self._setControls[currentControlID].update(x, y);
                }; 
                element.click(function(){
                    if(self._cb && self._cb.onClickMarker){
                        self._cb.onClickMarker(this.data("info"));
                    }
                });
                self._setMarkers.push(element);
            }
            else{
                element = self._paper.circle(0, 0, 0).hide();
                element.update = function (x, y){};
                self._setMarkers.push(element);
            }

        }
    },
    _addAnimatedPath: function(){
        var self = this;
        
        var endAnimPathCallback = function() {
            if(self._pathBezierAnimated){
                self._pathBezierAnimated.hide(); 
            }
            if(self._pathBezierFixed){
                self._pathBezierFixed.hide();
            }
            self._pathBezier.show();
            if(self._circleControls){
                self._circleControls.toFront();
                self._circleControls.show();
            }
            
            if(self._cb && self._cb.onAnimationEnd){
                self._cb.onAnimationEnd();
            }
            
            if(self._markers){
                self._markers.show();
            }
        };
        if(self.options && self.options.transition){
            this._paper.customAttributes.alongBezier = function(a) {
                var r = this.data('reverse');
                var len = this.data('pathLength');
                if(a > 0){
                    return {path: this.data('bezierPath').getSubpath(r ? (1-a)*len : 0, r ? len : a*len)};
                }
            };
            self._pathBezierAnimated = self._paper.path()
            .data('bezierPath', self._pathBezier)
            .data('pathLength', self._pathBezier.getTotalLength())
            .data('reverse', false)
            .attr(self._attr)
            .attr({alongBezier:self._startNormalized});

            if(!self._enablePathAnimation){
                endAnimPathCallback();
            }
            else{
                self._enablePathAnimation = false;
                setTimeout(function(){
                    self._pathBezierAnimated.stop().animate({
                        alongBezier: 1
                    }, 
                    self.options.transition.animationDuration, 
                    endAnimPathCallback);
                }, self.options.startAnimateTimeout);
            }
        }
        else{
            endAnimPathCallback();
        }
    },
    _addAnimatedMarker: function(){
        var self = this;
        if(self.options &&
            self.options.transition &&
            self.options.transition.icon && 
            self.options.transition.icon.url !== ""
        ){
            this._paper.customAttributes.followBezier = function(a) {
                this.show();
                var r =  this.data('reverse');
                var len = this.data('pathLength');
                var point = this.data('bezierPath').getPointAtLength(r ? len : a*len);
                if(!isNaN(point.x) && a > 0){                
                    return {
//                         href:self.options.transition.icon.url, 
                        x: point.x - self.options.transition.icon.anchor[0], 
                        y: point.y - self.options.transition.icon.anchor[1], 
                        width:self.options.transition.icon.size[0], 
                        height: self.options.transition.icon.size[1]
                    };
                }
            };

            self._markerAnimated = self._paper.image(self.options.transition.icon.url)
            .data('bezierPath', self._pathBezier)
            .data('pathLength', self._pathBezier.getTotalLength())
            .data('reverse', false)
            .attr({fill: "#fff", stroke: "#000", followBezier: self._startNormalized});
            
            self._markerAnimated.click(function(){
                if(self._cb && self._cb.onClickMarker && self.options.pathInfo){
                    self._cb.onClickMarker(self.options.pathInfo);
                }
            });
            
            self._markerAnimated.hide();
            
            var endAnimMarkerCallback = function() {
                self._markerAnimated.attr({followBezier: self.options.transition.icon.stopAt});
                if(self._markerAnimated && self.options.transition.icon.hideOnStop){
                    self._markerAnimated.hide();    
                }
                else{
                    self._markerAnimated.attr({cursor: "pointer"});
                    
                }    
            };
            
            if(!self._enableMarkerAnimation){
                endAnimMarkerCallback();
            }
            else{
                self._enableMarkerAnimation = false;
                setTimeout(function(){
                    self._markerAnimated.stop().animate({
                        followBezier: self.options.transition.icon.stopAt
                    }, 
                    self.options.transition.animationDuration, 
                    endAnimMarkerCallback);
                }, self.options.startAnimateTimeout);
            }
        }
    }
});

R.TrackAnim = R.Layer.extend({
    initialize: function(latlngs, attr, cb, options) {
        R.Layer.prototype.initialize.call(this, options);

        this._latlngs = latlngs;
        if(attr){
            this._attr = attr;
        }
        else{
            this._attr = {stroke: "blue", "stroke-width": 4}
        }
        this._cb = cb;
        this._enablePathAnimation = true;
        this._enableMarkerAnimation = true;
        this._dataToSend = {};
    },
    update: function(data){
        R.Layer.prototype.update.call(this, data.objectOptions);
        this.initialize(data.markers, data.attribut, data.callbacks, data.objectOptions);
        this.projectLatLngs();
    },
    onRemove: function (map) {
        R.Layer.prototype.onRemove.call(this, map);
        this._reset();
    },
    projectLatLngs: function() {
        var self = this;
        self._reset();
        if(self._latlngs.length > 0){

            //Init sets
            self._setMarkers = self._paper.set();

            //Parse all points
            for(var pointID = 0; pointID < self._latlngs.length; pointID++){
                var symetricPoint = false;
                var currentPoint = self._map.latLngToLayerPoint(self._latlngs[pointID]);
                if(pointID === 0){
                    self._arrayBezier.push("M");
                }
                else if(pointID > 0) {
                    self._arrayBezier.push("L"); 
                }
                self._arrayBezier.push([currentPoint.x, currentPoint.y]);
            }

            //Draw markers
            if(self.options && self.options.markers){
                for(var markerID = 0; markerID < self.options.markers.length; markerID++){
                    self._addMarker(markerID);      
                }
            }

            //Convert array to path 
            self._pathBezier = self._paper.path(self._arrayBezier).hide();
            if(self.options && self.options.renderLastOnly && self._arrayBezier.length > 2){
                self._pathBezierFixed = self._paper.path(self._arrayBezier.slice(0, self._arrayBezier.length - 3));
                self._pathBezierFixed.attr(self._attr);
                self._startNormalized = self._pathBezierFixed.getTotalLength() / self._pathBezier.getTotalLength();
            }

            //Set all attributs
            self._pathBezier.attr(self._attr);
            self._pathBezier.attr({"stroke-linecap": "round", cursor: "pointer"});

            //Connect mouse event
            self._pathBezier.click(function(){
                if(self._cb && self._cb.onClickPath && self.options.pathInfo){
                    self._cb.onClickPath(self.options.pathInfo);
                }
            });

            self._addAnimatedPath();
            self._addAnimatedMarker();
        }
    },
    _reset:function(){
        
        if(this._pathBezier) this._pathBezier.remove();
        if(this._setMarkers) this._setMarkers.remove();
        if(this._pathBezierAnimated) this._pathBezierAnimated.remove();
        if(this._markerAnimated) this._markerAnimated.remove();
        if(this._pathBezierFixed) this._pathBezierFixed.remove();
        this._arrayBezier = [];
        this._startNormalized = 0;
    },
    _addMarker: function(pointID){
        var self = this;
        if(self._setMarkers && 
            self.options &&
            self.options.markers && 
            self.options.markers[pointID]){
            var point = self._map.latLngToLayerPoint(self.options.markers[pointID].latlng);

            var element = null;
            if(self.options.markers[pointID].icon){
                element = self._paper.image(self.options.markers[pointID].icon.url, 
                                      point.x - self.options.markers[pointID].icon.anchor[0], 
                                      point.y - self.options.markers[pointID].icon.anchor[1], 
                                      self.options.markers[pointID].icon.size[0], 
                                      self.options.markers[pointID].icon.size[1]).show();
                element.attr({cursor:"pointer"});
                element.data("pointID", pointID);
                if(self.options.markersInfos){
                    element.data("info", self.options.markersInfos[pointID]);
                }
                element.click(function(){
                    if(self._cb && self._cb.onClickMarker){
                        self._cb.onClickMarker(this.data("info"));
                    }
                });
                self._setMarkers.push(element);
            }
            else{
                element = self._paper.circle(0, 0, 0).hide();
                element.update = function (x, y){};
                self._setMarkers.push(element);
            }

        }
    },
    _addAnimatedPath: function(){
        var self = this;
        
        var endAnimPathCallback = function() {
            if(self._pathBezierAnimated){
                self._pathBezierAnimated.hide(); 
            }
            if(self._pathBezierFixed){
                self._pathBezierFixed.hide();
            }
            self._pathBezier.show();
            
            if(self._cb && self._cb.onAnimationEnd){
                self._cb.onAnimationEnd();
            }
            
            if(self._markers){
                self._markers.show();
            }
        };
        if(self.options && self.options.transition){
            this._paper.customAttributes.alongBezier = function(a) {
                var r = this.data('reverse');
                var len = this.data('pathLength');
                if(a > 0){
                    return {path: this.data('bezierPath').getSubpath(r ? (1-a)*len : 0, r ? len : a*len)};
                }
            };
            self._pathBezierAnimated = self._paper.path()
            .data('bezierPath', self._pathBezier)
            .data('pathLength', self._pathBezier.getTotalLength())
            .data('reverse', false)
            .attr(self._attr)
            .attr({alongBezier:self._startNormalized});

            if(!self._enablePathAnimation){
                endAnimPathCallback();
            }
            else{
                self._enablePathAnimation = false;
                setTimeout(function(){
                    self._pathBezierAnimated.stop().animate({
                        alongBezier: 1
                    }, 
                    self.options.transition.animationDuration, 
                    endAnimPathCallback);
                }, self.options.startAnimateTimeout);
            }
        }
        else{
            endAnimPathCallback();
        }
    },
    _addAnimatedMarker: function(){
        var self = this;
        if(self.options &&
            self.options.transition &&
            self.options.transition.icon && 
            self.options.transition.icon.url !== ""
        ){
            this._paper.customAttributes.followBezier = function(a) {
                this.show();
                var r =  this.data('reverse');
                var len = this.data('pathLength');
                var point = this.data('bezierPath').getPointAtLength(r ? len : a*len);
                if(!isNaN(point.x) && a > 0){                
                    return {
//                         href:self.options.transition.icon.url, 
                        x: point.x - self.options.transition.icon.anchor[0], 
                        y: point.y - self.options.transition.icon.anchor[1], 
                        width:self.options.transition.icon.size[0], 
                        height: self.options.transition.icon.size[1]
                    };
                }
            };

            self._markerAnimated = self._paper.image(self.options.transition.icon.url)
            .data('bezierPath', self._pathBezier)
            .data('pathLength', self._pathBezier.getTotalLength())
            .data('reverse', false)
            .attr({fill: "#fff", stroke: "#000", followBezier: self._startNormalized});
            
            self._markerAnimated.click(function(){
                if(self._cb && self._cb.onClickMarker && self.options.pathInfo){
                    self._cb.onClickMarker(self.options.pathInfo);
                }
            });
            
            self._markerAnimated.hide();
            
            var endAnimMarkerCallback = function() {
                self._markerAnimated.attr({followBezier: self.options.transition.icon.stopAt});
                if(self._markerAnimated && self.options.transition.icon.hideOnStop){
                    self._markerAnimated.hide();    
                }
                else{
                    self._markerAnimated.attr({cursor: "pointer"});
                    
                }    
            };
            
            if(!self._enableMarkerAnimation){
                endAnimMarkerCallback();
            }
            else{
                self._enableMarkerAnimation = false;
                setTimeout(function(){
                    self._markerAnimated.stop().animate({
                        followBezier: self.options.transition.icon.stopAt
                    }, 
                    self.options.transition.animationDuration, 
                    endAnimMarkerCallback);
                }, self.options.startAnimateTimeout);
            }
        }
    }
});

R.FeatureGroup = L.FeatureGroup.extend({
	initialize: function(layers, options) {
		L.FeatureGroup.prototype.initialize.call(this, layers, options);
	},

	animate: function(attr, ms, easing, callback) {
		this.eachLayer(function(layer) {
			layer.animate(attr, ms, easing, callback);
		});
	},

	onAdd: function(map) {
		L.FeatureGroup.prototype.onAdd.call(this,map);

		this._set = this._map._paper.set();

		for(i in this._layers) {
			this._set.push(this._layers[i]._set);
		}
	},

	hover: function(h_in, h_out, c_in, c_out) {
		this.eachLayer(function(layer) {
			layer.hover(h_in, h_out, c_in, c_out);
		});

		return this;
	},

	attr: function(name, value) {
		this.eachLayer(function(layer) {
			layer.attr(name, value);
		});
		
		return this;
	}
});

/*
 * Contains L.MultiPolyline and L.MultiPolygon layers.
 */

(function () {
	function createMulti(Klass) {
		return R.FeatureGroup.extend({
			initialize: function (latlngs, options) {
				this._layers = {};
				this._options = options;
				this.setLatLngs(latlngs);
			},

			setLatLngs: function (latlngs) {
				var i = 0, len = latlngs.length;

				this.eachLayer(function (layer) {
					if (i < len) {
						layer.setLatLngs(latlngs[i++]);
					} else {
						this.removeLayer(layer);
					}
				}, this);

				while (i < len) {
					this.addLayer(new Klass(latlngs[i++], this._options));
				}

				return this;
			}
		});
	}

	R.MultiPolyline = createMulti(R.Polyline);
	R.MultiPolygon = createMulti(R.Polygon);
}());

R.GeoJSON = R.FeatureGroup.extend({
	initialize: function (geojson, options) {
		L.Util.setOptions(this, options);

		this._geojson = geojson;
		this._layers = {};
		
		if (geojson) {
			this.addGeoJSON(geojson);
		}
	},

	addGeoJSON: function (geojson) {
		var features = geojson.features,
		    i, len;

		if (features) {
			for (i = 0, len = features.length; i < len; i++) {
				this.addGeoJSON(features[i]);
			}
			return;
		}

		var isFeature = (geojson.type === 'Feature'),
		    geometry = isFeature ? geojson.geometry : geojson,
		    layer = R.GeoJSON.geometryToLayer(geometry, this.options.pointToLayer);

		this.fire('featureparse', {
			layer: layer,
			properties: geojson.properties,
			geometryType: geometry.type,
			bbox: geojson.bbox,
			id: geojson.id,
			geometry: geojson.geometry
		});

		this.addLayer(layer);
	}
});

L.Util.extend(R.GeoJSON, {
	geometryToLayer: function (geometry, pointToLayer) {
		var coords = geometry.coordinates,
		    layers = [],
		    latlng, latlngs, i, len, layer;

		switch (geometry.type) {
		case 'Point':
			latlng = this.coordsToLatLng(coords);
			return pointToLayer ? pointToLayer(latlng) : new R.Marker(latlng);

		case 'MultiPoint':
			for (i = 0, len = coords.length; i < len; i++) {
				latlng = this.coordsToLatLng(coords[i]);
				layer = pointToLayer ? pointToLayer(latlng) : new R.Marker(latlng);
				layers.push(layer);
			}
			return new R.FeatureGroup(layers);

		case 'LineString':
			latlngs = this.coordsToLatLngs(coords);
			return new R.Polyline(latlngs);

		case 'Polygon':
			latlngs = this.coordsToLatLngs(coords, 1);
			return new R.Polygon(latlngs);

		case 'MultiLineString':
			latlngs = this.coordsToLatLngs(coords, 1);
			return new R.MultiPolyline(latlngs);

		case "MultiPolygon":
			latlngs = this.coordsToLatLngs(coords, 2);
			return new R.MultiPolygon(latlngs);

		case "GeometryCollection":
			for (i = 0, len = geometry.geometries.length; i < len; i++) {
				layer = this.geometryToLayer(geometry.geometries[i], pointToLayer);
				layers.push(layer);
			}
			return new R.FeatureGroup(layers);

		default:
			throw new Error('Invalid GeoJSON object.');
		}
	},

	coordsToLatLng: function (coords, reverse) { // (Array, Boolean) -> LatLng
		var lat = parseFloat(coords[reverse ? 0 : 1]),
		    lng = parseFloat(coords[reverse ? 1 : 0]);

		return new L.LatLng(lat, lng, true);
	},

	coordsToLatLngs: function (coords, levelsDeep, reverse) { // (Array, Number, Boolean) -> Array
		var latlng,
		    latlngs = [],
		    i, len;

		for (i = 0, len = coords.length; i < len; i++) {
			latlng = levelsDeep ?
					this.coordsToLatLngs(coords[i], levelsDeep - 1, reverse) :
					this.coordsToLatLng(coords[i], reverse);
			latlngs.push(latlng);
		}

		return latlngs;
	}
});



}());
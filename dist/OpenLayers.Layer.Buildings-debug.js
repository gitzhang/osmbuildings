/**
 * Copyright (C) 2012 OSM Buildings, Jan Marsch
 * A leightweight JavaScript library for visualizing 3D building geometry on interactive maps.
 * @osmbuildings, http://osmbuildings.org
 */
//****** file: prefix.js ******

/*jshint bitwise:false */

(function (global) {
    'use strict';


//****** file: shortcuts.js ******

    // object access shortcuts
    var
        Int32Array = Int32Array || Array,
        exp = Math.exp,
        log = Math.log,
        tan = Math.tan,
        atan = Math.atan,
        min = Math.min,
        max = Math.max,
        doc = global.document
    ;


//****** file: Color.js ******

/*jshint white:false */

var Color = (function () {

    function hsla2rgb(hsla) {
        var r, g, b;

        if (hsla.s === 0) {
            r = g = b = hsla.l; // achromatic
        } else {
            var
                q = hsla.l < 0.5 ? hsla.l * (1 + hsla.s) : hsla.l + hsla.s - hsla.l * hsla.s,
                p = 2 * hsla.l - q
            ;
            r = hue2rgb(p, q, hsla.h + 1 / 3);
            g = hue2rgb(p, q, hsla.h);
            b = hue2rgb(p, q, hsla.h - 1 / 3);
        }
        return new Color(
            r * 255 << 0,
            g * 255 << 0,
            b * 255 << 0,
            hsla.a
        );
    }

    function hue2rgb(p, q, t) {
        if (t < 0) {
            t += 1;
        }
        if (t > 1) {
            t -= 1;
        }
        if (t < 1 / 6) {
            return p + (q - p) * 6 * t;
        }
        if (t < 1 / 2) {
            return q;
        }
        if (t < 2 / 3) {
            return p + (q - p) * (2 / 3 - t) * 6;
        }
        return p;
    }

    function C(r, g, b, a) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = arguments.length < 4 ? 1 : a;
    }

    var proto = C.prototype;

    proto.toString = function () {
        return 'rgba(' + [this.r, this.g, this.b, this.a.toFixed(2)].join(',') + ')';
    };

    proto.adjustLightness = function (l) {
        var hsla = Color.toHSLA(this);
        hsla.l *= l;
        hsla.l = Math.min(1, Math.max(0, hsla.l));
        return hsla2rgb(hsla);
    };

    proto.adjustAlpha = function (a) {
        return new Color(this.r, this.g, this.b, this.a * a);
    };

    C.parse = function (str) {
        var m;
        str += '';
        if (~str.indexOf('#')) {
            m = str.match(/^#?(\w{2})(\w{2})(\w{2})(\w{2})?$/);
            return new Color(
                parseInt(m[1], 16),
                parseInt(m[2], 16),
                parseInt(m[3], 16),
                m[4] ? parseInt(m[4], 16) / 255 : 1
            );
        }

        m = str.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)(\D+([\d.]+))?\)/);
        if (m) {
             return new Color(
                parseInt(m[1], 10),
                parseInt(m[2], 10),
                parseInt(m[3], 10),
                m[4] ? parseFloat(m[5], 10) : 1
            );
        }
    };

    C.toHSLA = function (rgba) {
        var
            r = rgba.r / 255,
            g = rgba.g / 255,
            b = rgba.b / 255,
            max = Math.max(r, g, b), min = Math.min(r, g, b),
            h, s, l = (max + min) / 2,
            d
        ;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return { h: h, s: s, l: l, a: rgba.a };
    };

    return C;

}());

/*jshint white:true */

//****** file: constants.js ******

    // constants, shared to all instances
    var
        VERSION = '0.1.7a',
        ATTRIBUTION = '&copy; <a href="http://osmbuildings.org">OSM Buildings</a>',

        PI = Math.PI,
        HALF_PI = PI / 2,
        QUARTER_PI = PI / 4,
        RAD = 180 / PI,

        TILE_SIZE = 256,
        MIN_ZOOM = 14, // for buildings data only, GeoJSON should not be affected

        CAM_Z = 400,
        MAX_HEIGHT = CAM_Z - 50,

        LAT = 'latitude', LON = 'longitude',
        HEIGHT = 0, FOOTPRINT = 1, COLOR = 2, CENTER = 3, IS_NEW = 4, RENDERCOLOR = 5
    ;


//****** file: geometry.js ******

    function simplify(points) {
        var cost,
            curr, prev = [points[0], points[1]], next,
            newPoints = [points[0], points[1]]
        ;

        // TODO this is not iterative yet
        for (var i = 2, il = points.length - 3; i < il; i += 2) {
            curr = [points[i], points[i + 1]];
            next = [points[i + 2] || points[0], points[i + 3] || points[1]];
            cost = collapseCost(prev, curr, next);
            if (cost > 750) {
                newPoints.push(curr[0], curr[1]);
                prev = curr;
            }
        }

        if (curr[0] !== points[0] || curr[1] !== points[1]) {
            newPoints.push(points[0], points[1]);
        }

        return newPoints;
    }

    function collapseCost(a, b, c) {
        var dist = segmentDistance(b, a, c) * 2; // * 2: put more weight in angle
        var length = distance(a, c);
        return dist * length;
    }

    function distance(p1, p2) {
        var dx = p1[0] - p2[0],
            dy = p1[1] - p2[1]
        ;
        return dx * dx + dy * dy;
    }

    function segmentDistance(p, p1, p2) { // square distance from a point to a segment
        var x = p1[0],
            y = p1[1],
            dx = p2[0] - x,
            dy = p2[1] - y,
            t
        ;
        if (dx !== 0 || dy !== 0) {
            t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) {
                x = p2[0];
                y = p2[1];
            } else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }
        return distance(p, [x, y]);
    }

    function center(points) {
        var len,
            x = 0, y = 0
        ;
        for (var i = 0, il = points.length - 3; i < il; i += 2) {
            x += points[i];
            y += points[i + 1];
        }
        len = (points.length - 2) * 2;
        return [x / len << 0, y / len << 0];
    }


//****** file: prefix.class.js ******

    global.OSMBuildings = function (u) {


//****** file: variables.js ******

        // private variables, specific to an instance
        var
            width = 0, height = 0,
            halfWidth = 0, halfHeight = 0,
            originX = 0, originY = 0,
            zoom, size,

            req,

            canvas, context,

            url,

            wallColor = new Color(200, 190, 180),
            altColor = wallColor.adjustLightness(0.8),
            roofColor = wallColor.adjustLightness(1.2),

            wallColorAlpha = wallColor + '',
            altColorAlpha  = altColor + '',
            roofColorAlpha = roofColor + '',

            rawData,
            meta, data,

            fadeFactor = 1, fadeTimer,
            zoomAlpha = 1,

            minZoom = MIN_ZOOM,
            maxZoom = 20,
            camX, camY,

            isZooming
        ;


//****** file: functions.js ******

        function createCanvas(parentNode) {
            canvas = doc.createElement('canvas');
            canvas.style.webkitTransform = 'translate3d(0,0,0)'; // turn on hw acceleration
            canvas.style.imageRendering = 'optimizeSpeed';
            canvas.style.position = 'absolute';
            canvas.style.pointerEvents = 'none';
            canvas.style.left = 0;
            canvas.style.top = 0;
            parentNode.appendChild(canvas);

            context = canvas.getContext('2d');
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.lineWidth = 1;

            try {
                context.mozImageSmoothingEnabled = false;
            } catch (err) {
            }

            return canvas;
        }

        function destroyCanvas() {
            canvas.parentNode.removeChild(canvas);
        }

        function pixelToGeo(x, y) {
            var res = {};
            x /= size;
            y /= size;
            res[LAT] = y <= 0  ? 90 : y >= 1 ? -90 : RAD * (2 * atan(exp(PI * (1 - 2 * y))) - HALF_PI),
            res[LON] = (x === 1 ?  1 : (x % 1 + 1) % 1) * 360 - 180;
            return res;
        }

        function geoToPixel(lat, lon) {
            var
                latitude = min(1, max(0, 0.5 - (log(tan(QUARTER_PI + HALF_PI * lat / 180)) / PI) / 2)),
                longitude = lon / 360 + 0.5
            ;
            return {
                x: longitude * size << 0,
                y: latitude  * size << 0
            };
        }

        function template(str, data) {
            return str.replace(/\{ *([\w_]+) *\}/g, function (x, key) {
                return data[key];
            });
        }


//****** file: data.js ******

        function xhr(url, callback) {
            var x = new XMLHttpRequest();
            x.onreadystatechange = function () {
                if (x.readyState !== 4) {
                    return;
                }
                if (!x.status || x.status < 200 || x.status > 299) {
                    return;
                }
                if (x.responseText) {
                    callback(JSON.parse(x.responseText));
                }
            };
            x.open('GET', url);
            x.send(null);
            return x;
        }

        function loadData() {
            if (!url || zoom < MIN_ZOOM) {
                return;
            }
            var
                // create bounding box of double viewport size
                nw = pixelToGeo(originX         - halfWidth, originY          - halfHeight),
                se = pixelToGeo(originX + width + halfWidth, originY + height + halfHeight)
            ;
            if (req) {
                req.abort();
            }
            req = xhr(template(url, {
                w: nw[LON],
                n: nw[LAT],
                e: se[LON],
                s: se[LAT],
                z: zoom
            }), onDataLoaded);
        }

        function onDataLoaded(res) {
            var
                i, il,
                resData, resMeta,
                keyList = [], k,
                offX = 0, offY = 0,
                item,
                footprint
            ;

            minZoom = MIN_ZOOM;
            setZoom(zoom); // recalculating all zoom related variables
            req = null;

            // no response or response not matching current zoom (too old response)
            if (!res || res.meta.z !== zoom) {
                return;
            }

            resMeta = res.meta;
            resData = res.data;

            // offset between old and new data set
            if (meta && data && meta.z === resMeta.z) {
                offX = meta.x - resMeta.x;
                offY = meta.y - resMeta.y;

                // identify already present buildings to fade in new ones
                for (i = 0, il = data.length; i < il; i++) {
                    // id key: x,y of first point - good enough
                    keyList[i] = (data[i][FOOTPRINT][0] + offX) + ',' + (data[i][FOOTPRINT][1] + offY);
                }
            }

            meta = resMeta;
            data = [];
            for (i = 0, il = resData.length; i < il; i++) {
                item = [];

                footprint = simplify(resData[i][FOOTPRINT]);
                if (footprint.length < 8) { // 3 points & end = start (x2)
                    continue;
                }

                item[FOOTPRINT] = footprint;
                item[CENTER] = center(footprint);

                item[HEIGHT] = min(resData[i][HEIGHT], MAX_HEIGHT);
                k = item[FOOTPRINT][0] + ',' + item[FOOTPRINT][1];
                item[IS_NEW] = !(keyList && ~keyList.indexOf(k));

                item[COLOR] = [];
                item[RENDERCOLOR] = [];

                data.push(item);
            }
            resMeta = resData = keyList = null; // gc
            fadeIn();
        }

        // detect polygon winding direction: clockwise or counter clockwise
        function getPolygonWinding(points) {
            var
                x1, y1, x2, y2,
                a = 0,
                i, il
            ;
            for (i = 0, il = points.length - 3; i < il; i += 2) {
                x1 = points[i];
                y1 = points[i + 1];
                x2 = points[i + 2];
                y2 = points[i + 3];
                a += x1 * y2 - x2 * y1;
            }
            return (a / 2) > 0 ? 'CW' : 'CCW';
        }

        // make polygon winding clockwise. This is needed for proper backface culling on client side.
        function makeClockwiseWinding(points) {
            var winding = getPolygonWinding(points);
            if (winding === 'CW') {
                return points;
            }
            var revPoints = [];
            for (var i = points.length - 2; i >= 0; i -= 2) {
                revPoints.push(points[i], points[i + 1]);
            }
            return revPoints;
        }

        function scaleData(data, isNew) {
            var
                res = [],
                i, il, j, jl,
                oldItem, item,
                coords, p,
                footprint,
                z = maxZoom - zoom
            ;

            for (i = 0, il = data.length; i < il; i++) {
                oldItem = data[i];
                coords = oldItem[FOOTPRINT];
                footprint = new Int32Array(coords.length);
                for (j = 0, jl = coords.length - 1; j < jl; j += 2) {
                    p = geoToPixel(coords[j], coords[j + 1]);
                    footprint[j]     = p.x;
                    footprint[j + 1] = p.y;
                }

                footprint = simplify(footprint);
                if (footprint.length < 8) { // 3 points & end = start (x2)
                    continue;
                }

                item = [];
                item[FOOTPRINT]   = footprint;
                item[CENTER]      = center(footprint);
                item[HEIGHT]      = min(oldItem[HEIGHT] >> z, MAX_HEIGHT);
                item[IS_NEW]      = isNew;
                item[COLOR]       = oldItem[COLOR];
                item[RENDERCOLOR] = [];

                for (j = 0; j < 3; j++) {
                    if (item[COLOR][j]) {
                        item[RENDERCOLOR][j] = item[COLOR][j].adjustAlpha(zoomAlpha) + '';
                    }
                }

                res.push(item);
            }

            return res;
        }

        function geoJSON(url, isLatLon) {
            if (typeof url === 'object') {
                setData(url, !isLatLon);
                return;
            }
            var
                el = doc.documentElement,
                callback = 'jsonpCallback',
                script = doc.createElement('script')
            ;
            global[callback] = function (res) {
                delete global[callback];
                el.removeChild(script);
                setData(res, !isLatLon);
            };
            el.insertBefore(script, el.lastChild).src = url.replace(/\{callback\}/, callback);
        }

        function parseGeoJSON(json, isLonLat, res) {
            if (res === undefined) {
                res = [];
            }

            var
                i, il,
                j, jl,
                features = json[0] ? json : json.features,
                geometry, polygons, coords, properties,
                footprint, heightSum,
                propHeight, propWallColor, propRoofColor,
                lat = isLonLat ? 1 : 0,
                lon = isLonLat ? 0 : 1,
                alt = 2,
                item
            ;

            if (features) {
                for (i = 0, il = features.length; i < il; i++) {
                    parseGeoJSON(features[i], isLonLat, res);
                }
                return res;
            }

            if (json.type === 'Feature') {
                geometry = json.geometry;
                properties = json.properties;
            }
        //      else geometry = json

            if (geometry.type === 'Polygon') {
                polygons = [geometry.coordinates];
            }
            if (geometry.type === 'MultiPolygon') {
                polygons = geometry.coordinates;
            }

            if (polygons) {
                propHeight = properties.height;
                if (properties.color || properties.wallColor) {
                    propWallColor = Color.parse(properties.color || properties.wallColor);
                }
                if (properties.roofColor) {
                    propRoofColor = Color.parse(properties.roofColor);
                }

                for (i = 0, il = polygons.length; i < il; i++) {
                    coords = polygons[i][0];
                    footprint = [];
                    heightSum = 0;
                    for (j = 0, jl = coords.length; j < jl; j++) {
                        footprint.push(coords[j][lat], coords[j][lon]);
                        heightSum += propHeight || coords[j][alt] || 0;
                    }

                    if (heightSum) {
                        item = [];
                        item[FOOTPRINT] = makeClockwiseWinding(footprint);
                        item[HEIGHT]    = heightSum / coords.length << 0;
                        item[COLOR] = [
                            propWallColor || null,
                            propWallColor ? propWallColor.adjustLightness(0.8) : null,
                            propRoofColor ? propRoofColor : propWallColor ? propWallColor.adjustLightness(1.2) : roofColor
                        ];
                        res.push(item);
                    }
                }
            }
            return res;
        }

        function setData(json, isLonLat) {
            if (!json) {
                rawData = null;
                render(); // effectively clears
                return;
            }

            rawData = parseGeoJSON(json, isLonLat);
            minZoom = 0;
            setZoom(zoom); // recalculating all zoom related variables

            meta = {
                n: 90,
                w: -180,
                s: -90,
                e: 180,
                x: 0,
                y: 0,
                z: zoom
            };
            data = scaleData(rawData, true);

            fadeIn();
        }

//****** file: properties.js ******

        function setSize(w, h) {
            width  = w;
            height = h;
            halfWidth  = width / 2 << 0;
            halfHeight = height / 2 << 0;
            camX = halfWidth;
            camY = height;
            canvas.width = width;
            canvas.height = height;
        }

        function setOrigin(x, y) {
            originX = x;
            originY = y;
        }

        function setZoom(z) {
            var i, il, j,
                item
            ;

            zoom = z;
            size = TILE_SIZE << zoom;

            zoomAlpha = 1 - (zoom - minZoom) * 0.3 / (maxZoom - minZoom);

            wallColorAlpha = wallColor.adjustAlpha(zoomAlpha) + '';
            altColorAlpha  = altColor.adjustAlpha(zoomAlpha) + '';
            roofColorAlpha = roofColor.adjustAlpha(zoomAlpha) + '';

            if (data) {
                for (i = 0, il = data.length; i < il; i++) {
                    item = data[i];
                    item[RENDERCOLOR] = [];
                    for (j = 0; j < 3; j++) {
                        if (item[COLOR][j]) {
                            item[RENDERCOLOR][j] = item[COLOR][j].adjustAlpha(zoomAlpha) + '';
                        }
                    }
                }
            }
        }

        function setCam(x, y) {
            camX = x;
            camY = y;
        }

        function setStyle(style) {
            style = style || {};
            if (style.color || style.wallColor) {
                wallColor = Color.parse(style.color || style.wallColor);
                wallColorAlpha = wallColor.adjustAlpha(zoomAlpha) + '';

                altColor = wallColor.adjustLightness(0.8);
                altColorAlpha = altColor.adjustAlpha(zoomAlpha) + '';

                roofColor = wallColor.adjustLightness(1.2);
                roofColorAlpha = roofColor.adjustAlpha(zoomAlpha) + '';
            }

            if (style.roofColor) {
                roofColor = Color.parse(style.roofColor);
                roofColorAlpha = roofColor.adjustAlpha(zoomAlpha) + '';
            }

            render();
        }


//****** file: events.js ******

        function onResize(e) {
            setSize(e.width, e.height);
            render();
            loadData();
        }

        function onMove(e) {
            setOrigin(e.x, e.y);
            render();
        }

        function onMoveEnd(e) {
            var
                nw = pixelToGeo(originX,         originY),
                se = pixelToGeo(originX + width, originY + height)
            ;
            render();
            // check, whether viewport is still within loaded data bounding box
            if (meta && (nw[LAT] > meta.n || nw[LON] < meta.w || se[LAT] < meta.s || se[LON] > meta.e)) {
                loadData();
            }
        }

        function onZoomStart(e) {
            isZooming = true;
            render(); // effectively clears because of isZooming flag
        }

        function onZoomEnd(e) {
            isZooming = false;
            setZoom(e.zoom);

            if (rawData) {
                data = scaleData(rawData);
                render();
            } else {
                render();
                loadData();
            }
        }


//****** file: render.js ******

        function fadeIn() {
            fadeFactor = 0;
            clearInterval(fadeTimer);
            fadeTimer = setInterval(function () {
                fadeFactor += 0.5 * 0.2; // amount * easing
                if (fadeFactor > 1) {
                    clearInterval(fadeTimer);
                    fadeFactor = 1;
                    // unset 'already present' marker
                    for (var i = 0, il = data.length; i < il; i++) {
                        data[i][IS_NEW] = 0;
                    }
                }
                render();
            }, 33);
        }

        function render() {
            context.clearRect(0, 0, width, height);

            // data needed for rendering
            if (!meta || !data) {
                return;
            }

            // show buildings in high zoom levels only
            // avoid rendering during zoom
            if (zoom < minZoom || isZooming) {
                return;
            }

            var
                i, il, j, jl,
                item,
                f, h, m,
                x, y,
                offX = originX - meta.x,
                offY = originY - meta.y,
                sortCam = [camX + offX, camY + offY],
                footprint, roof, walls,
                isVisible,
                ax, ay, bx, by, _a, _b
            ;

            data.sort(function (a, b) {
                return distance(b[CENTER], sortCam) / b[HEIGHT] - distance(a[CENTER], sortCam) / a[HEIGHT];
            });

            for (i = 0, il = data.length; i < il; i++) {
                item = data[i];

                isVisible = false;
                f = item[FOOTPRINT];
                footprint = []; // typed array would be created each pass and is way too slow
                for (j = 0, jl = f.length - 1; j < jl; j += 2) {
                    footprint[j]     = x = (f[j]     - offX);
                    footprint[j + 1] = y = (f[j + 1] - offY);

                    // checking footprint is sufficient for visibility
                    if (!isVisible) {
                        isVisible = (x > 0 && x < width && y > 0 && y < height);
                    }
                }

                if (!isVisible) {
                    continue;
                }

                // when fading in, use a dynamic height
                h = item[IS_NEW] ? item[HEIGHT] * fadeFactor : item[HEIGHT];

                // precalculating projection height scale
                m = CAM_Z / (CAM_Z - h);

                roof = []; // typed array would be created each pass and is way too slow
                walls = [];

                for (j = 0, jl = footprint.length - 3; j < jl; j += 2) {
                    ax = footprint[j];
                    ay = footprint[j + 1];
                    bx = footprint[j + 2];
                    by = footprint[j + 3];

                    // project 3d to 2d on extruded footprint
                    _a = project(ax, ay, m);
                    _b = project(bx, by, m);

                    // backface culling check
                    if ((bx - ax) * (_a.y - ay) > (_a.x - ax) * (by - ay)) {
                        walls = [
                            bx + 0.5, by + 0.5,
                            ax + 0.5, ay + 0.5,
                            _a.x, _a.y,
                            _b.x, _b.y
                        ];

                        // depending on direction, set wall shading
                        if ((ax < bx && ay < by) || (ax > bx && ay > by)) {
                            context.fillStyle = item[RENDERCOLOR][1] || altColorAlpha;
                        } else {
                            context.fillStyle = item[RENDERCOLOR][0] || wallColorAlpha;
                        }

                        drawShape(walls);
                    }

                    roof[j]     = _a.x;
                    roof[j + 1] = _a.y;
                }

                // fill roof and optionally stroke it
                context.fillStyle = item[RENDERCOLOR][2] || roofColorAlpha;
                context.strokeStyle = item[RENDERCOLOR][1] || altColorAlpha;
                drawShape(roof, true);
            }
        }

        function debugMarker(x, y, color, size) {
            context.fillStyle = color || '#ffcc00';
            context.beginPath();
            context.arc(x, y, size || 3, 0, PI * 2, true);
            context.closePath();
            context.fill();
        }

        function drawShape(points, stroke) {
            if (!points.length) {
                return;
            }

            context.beginPath();
            context.moveTo(points[0], points[1]);
            for (var i = 2, il = points.length; i < il; i += 2) {
                context.lineTo(points[i], points[i + 1]);
            }
            context.closePath();
            if (stroke) {
                context.stroke();
            }
            context.fill();
        }

        function project(x, y, m) {
            return {
                x: ((x - camX) * m + camX << 0) + 0.5, // + 0.5: disabling(!) anti alias
                y: ((y - camY) * m + camY << 0) + 0.5  // + 0.5: disabling(!) anti alias
            };
        }


//****** file: public.js ******

        this.setStyle = function (style) {
            setStyle(style);
            return this;
        };

        this.geoJSON = function (url, isLatLon) {
            geoJSON(url, isLatLon);
            return this;
        };

        this.setCamOffset = function (x, y) {
            camX = halfWidth + x;
            camY = height    + y;
        };

        this.setMaxZoom = function (z) {
            maxZoom = z;
        };

        this.createCanvas  = createCanvas;
        this.destroyCanvas = destroyCanvas;
        this.loadData      = loadData;
        this.onMoveEnd     = onMoveEnd;
        this.onZoomEnd     = onZoomEnd;
        this.onZoomStart   = onZoomStart;
        this.render        = render;
        this.setOrigin     = setOrigin;
        this.setSize       = setSize;
        this.setZoom       = setZoom;


//****** file: suffix.class.js ******

        url = u;
    };

    global.OSMBuildings.VERSION = VERSION;
    global.OSMBuildings.ATTRIBUTION = ATTRIBUTION;


//****** file: suffix.js ******

}(this));

/*jshint bitwise:true */

//****** file: OpenLayers.js ******

/**
 * basing on a pull request from Jérémy Judéaux (https://github.com/Volune)
 */

OpenLayers.Layer.Buildings = OpenLayers.Class(OpenLayers.Layer, {

    CLASS_NAME: 'OpenLayers.Layer.Buildings',

    name: 'OSM Buildings',
    attribution: OSMBuildings.ATTRIBUTION,

    isBaseLayer: false,
    alwaysInRange: true,

    dxSum: 0, // for cumulative cam offset during moveBy
    dySum: 0, // for cumulative cam offset during moveBy

    initialize: function (options) {
        options = options || {};
        options.projection = 'EPSG:900913';
        OpenLayers.Layer.prototype.initialize(this.name, options);
    },

    setOrigin: function () {
        var
            origin = this.map.getLonLatFromPixel(new OpenLayers.Pixel(0, 0)),
            res = this.map.resolution,
            ext = this.maxExtent,
            x = Math.round((origin.lon - ext.left) / res),
            y = Math.round((ext.top - origin.lat) / res)
        ;
        this.osmb.setOrigin(x, y);
    },

    setMap: function (map) {
        if (!this.map) {
            OpenLayers.Layer.prototype.setMap(map);
            this.osmb = new OSMBuildings(this.options.url);
            this.osmb.createCanvas(this.div);
            this.osmb.setSize(this.map.size.w, this.map.size.h);
            this.osmb.setZoom(this.map.zoom);
            this.setOrigin();
            this.osmb.loadData();
        }
    },

    removeMap: function (map) {
        this.osmb.destroyCanvas();
        this.osmb = null;
        OpenLayers.Layer.prototype.removeMap(map);
    },

    onMapResize: function () {
        OpenLayers.Layer.prototype.onMapResize();
        this.osmb.onResize({ width: this.map.size.w, height: this.map.size.h });
    },

    moveTo: function (bounds, zoomChanged, dragging) {
        var result = OpenLayers.Layer.prototype.moveTo(bounds, zoomChanged, dragging);
        if (!dragging) {
            var
                offsetLeft = parseInt(this.map.layerContainerDiv.style.left, 10),
                offsetTop  = parseInt(this.map.layerContainerDiv.style.top, 10)
            ;
            this.div.style.left = -offsetLeft + 'px';
            this.div.style.top  = -offsetTop  + 'px';
        }

        this.setOrigin();
        this.dxSum = 0;
        this.dySum = 0;
        this.osmb.setCamOffset(this.dxSum, this.dySum);

        if (zoomChanged) {
            this.osmb.onZoomEnd({ zoom: this.map.zoom });
        } else {
            this.osmb.onMoveEnd();
        }

        return result;
    },

    moveByPx: function (dx, dy) {
        this.dxSum += dx;
        this.dySum += dy;
        var result = OpenLayers.Layer.prototype.moveByPx(dx, dy);
        this.osmb.setCamOffset(this.dxSum, this.dySum);
        this.osmb.render();
        return result;
    },

    geoJSON: function (url, isLatLon) {
        return this.osmb.geoJSON(url, isLatLon);
    },

    setStyle: function (style)  {
        return this.osmb.setStyle(style);
    }
});



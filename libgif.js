/*
	SuperGif

	Example usage:

		<img src="./example1_preview.gif" rel:animated_src="./example1.gif" width="360" height="360" rel:auto_play="1" />

		<script type="text/javascript">
			$$('img').each(function (img_tag) {
				if (/.*\.gif/.test(img_tag.src)) {
					var rub = new SuperGif({ gif: img_tag } );
					rub.load();
				}
			});
		</script>

	Image tag attributes:

		rel:animated_src -	If this url is specified, it's loaded into the player instead of src.
							This allows a preview frame to be shown until animated gif data is streamed into the canvas

		rel:auto_play -		Defaults to 1 if not specified. If set to zero, a call to the play() method is needed

		rel:rubbable -		Defaults to 0 if not specified. If set to 1, the gif will be a canvas with handlers to handle rubbing.

	Constructor options

		gif 				Required. The DOM element of an img tag.
		auto_play 			Optional. Same as the rel:auto_play attribute above, this arg overrides the img tag info.
		max_width			Optional. Scale images over max_width down to max_width. Helpful with mobile.
		rubbable			Optional. Make it rubbable.

	Instance methods

		// loading
		load( callback )	Loads the gif into a canvas element and then calls callback if one is passed

		// play controls
		play -				Start playing the gif
		pause -				Stop playing the gif
		move_to(i) -		Move to frame i of the gif
		move_relative(i) -	Move i frames ahead (or behind if i < 0)

		// getters
		get_canvas			The canvas element that the gif is playing in. Handy for assigning event handlers to.
		get_playing			Whether or not the gif is currently playing
		get_loading			Whether or not the gif has finished loading/parsing
		get_auto_play		Whether or not the gif is set to play automatically
		get_length			The number of frames in the gif
		get_current_frame	The index of the currently displayed frame of the gif

*/

// Generic functions
var bitsToNum = function (ba) {
	return ba.reduce(function (s, n) {
		return s * 2 + n;
	}, 0);
};

var byteToBitArr = function (bite) {
	var a = [];
	for (var i = 7; i >= 0; i--) {
		a.push( !! (bite & (1 << i)));
	}
	return a;
};

// Stream
/**
 * @constructor
 */
// Make compiler happy.
var Stream = function (data) {
	this.data = data;
	this.len = this.data.length;
	this.pos = 0;

	this.readByte = function () {
		if (this.pos >= this.data.length) {
			throw new Error('Attempted to read past end of stream.');
		}
		return data.charCodeAt(this.pos++) & 0xFF;
	};

	this.readBytes = function (n) {
		var bytes = [];
		for (var i = 0; i < n; i++) {
			bytes.push(this.readByte());
		}
		return bytes;
	};

	this.read = function (n) {
		var s = '';
		for (var i = 0; i < n; i++) {
			s += String.fromCharCode(this.readByte());
		}
		return s;
	};

	this.readUnsigned = function () { // Little-endian.
		var a = this.readBytes(2);
		return (a[1] << 8) + a[0];
	};
};

var lzwDecode = function (minCodeSize, data) {
	// TODO: Now that the GIF parser is a bit different, maybe this should get an array of bytes instead of a String?
	var pos = 0; // Maybe this streaming thing should be merged with the Stream?
	var readCode = function (size) {
		var code = 0;
		for (var i = 0; i < size; i++) {
			if (data.charCodeAt(pos >> 3) & (1 << (pos & 7))) {
				code |= 1 << i;
			}
			pos++;
		}
		return code;
	};

	var output = [];

	var clearCode = 1 << minCodeSize;
	var eoiCode = clearCode + 1;

	var codeSize = minCodeSize + 1;

	var dict = [];

	var clear = function () {
		dict = [];
		codeSize = minCodeSize + 1;
		for (var i = 0; i < clearCode; i++) {
			dict[i] = [i];
		}
		dict[clearCode] = [];
		dict[eoiCode] = null;

	};

	var code;
	var last;

	while (true) {
		last = code;
		code = readCode(codeSize);

		if (code === clearCode) {
			clear();
			continue;
		}
		if (code === eoiCode) break;

		if (code < dict.length) {
			if (last !== clearCode) {
				dict.push(dict[last].concat(dict[code][0]));
			}
		}
		else {
			if (code !== dict.length) throw new Error('Invalid LZW code.');
			dict.push(dict[last].concat(dict[last][0]));
		}
		output.push.apply(output, dict[code]);

		if (dict.length === (1 << codeSize) && codeSize < 12) {
			// If we're at the last code and codeSize is 12, the next code will be a clearCode, and it'll be 12 bits long.
			codeSize++;
		}
	}

	// I don't know if this is technically an error, but some GIFs do it.
	//if (Math.ceil(pos / 8) !== data.length) throw new Error('Extraneous LZW bytes.');
	return output;
};


// The actual parsing; returns an object with properties.
var parseGIF = function (st, handler) {
	handler || (handler = {});

	// LZW (GIF-specific)
	var parseCT = function (entries) { // Each entry is 3 bytes, for RGB.
		var ct = [];
		for (var i = 0; i < entries; i++) {
			ct.push(st.readBytes(3));
		}
		return ct;
	};

	var readSubBlocks = function () {
		var size, data;
		data = '';
		do {
			size = st.readByte();
			data += st.read(size);
		} while (size !== 0);
		return data;
	};

	var parseHeader = function () {
		var hdr = {};
		hdr.sig = st.read(3);
		hdr.ver = st.read(3);
		if (hdr.sig !== 'GIF') throw new Error('Not a GIF file.'); // XXX: This should probably be handled more nicely.
		hdr.width = st.readUnsigned();
		hdr.height = st.readUnsigned();

		var bits = byteToBitArr(st.readByte());
		hdr.gctFlag = bits.shift();
		hdr.colorRes = bitsToNum(bits.splice(0, 3));
		hdr.sorted = bits.shift();
		hdr.gctSize = bitsToNum(bits.splice(0, 3));

		hdr.bgColor = st.readByte();
		hdr.pixelAspectRatio = st.readByte(); // if not 0, aspectRatio = (pixelAspectRatio + 15) / 64
		if (hdr.gctFlag) {
			hdr.gct = parseCT(1 << (hdr.gctSize + 1));
		}
		handler.hdr && handler.hdr(hdr);
	};

	var parseExt = function (block) {
		var parseGCExt = function (block) {
			var blockSize = st.readByte(); // Always 4
			var bits = byteToBitArr(st.readByte());
			block.reserved = bits.splice(0, 3); // Reserved; should be 000.
			block.disposalMethod = bitsToNum(bits.splice(0, 3));
			block.userInput = bits.shift();
			block.transparencyGiven = bits.shift();

			block.delayTime = st.readUnsigned();

			block.transparencyIndex = st.readByte();

			block.terminator = st.readByte();

			handler.gce && handler.gce(block);
		};

		var parseComExt = function (block) {
			block.comment = readSubBlocks();
			handler.com && handler.com(block);
		};

		var parsePTExt = function (block) {
			// No one *ever* uses this. If you use it, deal with parsing it yourself.
			var blockSize = st.readByte(); // Always 12
			block.ptHeader = st.readBytes(12);
			block.ptData = readSubBlocks();
			handler.pte && handler.pte(block);
		};

		var parseAppExt = function (block) {
			var parseNetscapeExt = function (block) {
				var blockSize = st.readByte(); // Always 3
				block.unknown = st.readByte(); // ??? Always 1? What is this?
				block.iterations = st.readUnsigned();
				block.terminator = st.readByte();
				handler.app && handler.app.NETSCAPE && handler.app.NETSCAPE(block);
			};

			var parseUnknownAppExt = function (block) {
				block.appData = readSubBlocks();
				// FIXME: This won't work if a handler wants to match on any identifier.
				handler.app && handler.app[block.identifier] && handler.app[block.identifier](block);
			};

			var blockSize = st.readByte(); // Always 11
			block.identifier = st.read(8);
			block.authCode = st.read(3);
			switch (block.identifier) {
			case 'NETSCAPE':
				parseNetscapeExt(block);
				break;
			default:
				parseUnknownAppExt(block);
				break;
			}
		};

		var parseUnknownExt = function (block) {
			block.data = readSubBlocks();
			handler.unknown && handler.unknown(block);
		};

		block.label = st.readByte();
		switch (block.label) {
		case 0xF9:
			block.extType = 'gce';
			parseGCExt(block);
			break;
		case 0xFE:
			block.extType = 'com';
			parseComExt(block);
			break;
		case 0x01:
			block.extType = 'pte';
			parsePTExt(block);
			break;
		case 0xFF:
			block.extType = 'app';
			parseAppExt(block);
			break;
		default:
			block.extType = 'unknown';
			parseUnknownExt(block);
			break;
		}
	};

	var parseImg = function (img) {
		var deinterlace = function (pixels, width) {
			// Of course this defeats the purpose of interlacing. And it's *probably*
			// the least efficient way it's ever been implemented. But nevertheless...
			var newPixels = new Array(pixels.length);
			var rows = pixels.length / width;
			var cpRow = function (toRow, fromRow) {
				var fromPixels = pixels.slice(fromRow * width, (fromRow + 1) * width);
				newPixels.splice.apply(newPixels, [toRow * width, width].concat(fromPixels));
			};

			// See appendix E.
			var offsets = [0, 4, 2, 1];
			var steps = [8, 8, 4, 2];

			var fromRow = 0;
			for (var pass = 0; pass < 4; pass++) {
				for (var toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
					cpRow(toRow, fromRow)
					fromRow++;
				}
			}

			return newPixels;
		};

		img.leftPos = st.readUnsigned();
		img.topPos = st.readUnsigned();
		img.width = st.readUnsigned();
		img.height = st.readUnsigned();

		var bits = byteToBitArr(st.readByte());
		img.lctFlag = bits.shift();
		img.interlaced = bits.shift();
		img.sorted = bits.shift();
		img.reserved = bits.splice(0, 2);
		img.lctSize = bitsToNum(bits.splice(0, 3));

		if (img.lctFlag) {
			img.lct = parseCT(1 << (img.lctSize + 1));
		}

		img.lzwMinCodeSize = st.readByte();

		var lzwData = readSubBlocks();

		img.pixels = lzwDecode(img.lzwMinCodeSize, lzwData);

		if (img.interlaced) { // Move
			img.pixels = deinterlace(img.pixels, img.width);
		}

		handler.img && handler.img(img);
	};

	var parseBlock = function () {
		var block = {};
		block.sentinel = st.readByte();

		switch (String.fromCharCode(block.sentinel)) { // For ease of matching
		case '!':
			block.type = 'ext';
			parseExt(block);
			break;
		case ',':
			block.type = 'img';
			parseImg(block);
			break;
		case ';':
			block.type = 'eof';
			handler.eof && handler.eof(block);
			break;
		default:
			throw new Error('Unknown block: 0x' + block.sentinel.toString(16)); // TODO: Pad this with a 0.
		}

		if (block.type !== 'eof') setTimeout(parseBlock, 0);
	};

	var parse = function () {
		parseHeader();
		setTimeout(parseBlock, 0);
	};

	parse();
};


var SuperGif = function ( options ) {

	var stream;
	var hdr;

	var loadError = null;
	var loading = false;

	var transparency = null;
	var delay = null;
	var disposalMethod = null;
	var lastDisposalMethod = null;
	var frame = null;

	var playing = true;
	var forward = true;
	var ctx_scaled = false;

	var frames = [];

	var gif = options.gif;
	if (typeof options.auto_play == 'undefined') 
		options.auto_play = (!gif.getAttribute('rel:auto_play') || gif.getAttribute('rel:auto_play') == '1');

	if (typeof options.rubbable == 'undefined') 
		options.rubbable = (!gif.getAttribute('rel:rubbable') || gif.getAttribute('rel:rubbable') == '1');

	var clear = function () {
		transparency = null;
		delay = null;
		lastDisposalMethod = disposalMethod;
		disposalMethod = null;
		frame = null;
	};

	// XXX: There's probably a better way to handle catching exceptions when
	// callbacks are involved.
	var doParse = function () {
		try {
			parseGIF(stream, handler);
		}
		catch (err) {
			doLoadError('parse');
		}
	};

	var doText = function (text) {
		toolbar.innerHTML = text; // innerText? Escaping? Whatever.
		toolbar.style.visibility = 'visible';
	};

	var doShowProgress = function (pos, length, draw) {
		if (draw) {
			var height = 25;
			var top = (canvas.height - height);
			var mid = (pos / length) * canvas.width;

			// XXX Figure out alpha fillRect.
			//ctx.fillStyle = 'salmon';
			ctx.fillStyle = 'rgba(255,255,255,0.4)';
			ctx.fillRect(mid, top, canvas.width - mid, height);

			//ctx.fillStyle = 'teal';
			ctx.fillStyle = 'rgba(255,0,22,.8)';
			ctx.fillRect(0, top, (pos / length) * canvas.width, height);
		}
	};

	var doLoadError = function (originOfError) {
		var drawError = function () {
			ctx.fillStyle = 'black';
			ctx.fillRect(0, 0, hdr.width, hdr.height);
			ctx.strokeStyle = 'red';
			ctx.lineWidth = 3;
			ctx.moveTo(0, 0);
			ctx.lineTo(hdr.width, hdr.height);
			ctx.moveTo(0, hdr.height);
			ctx.lineTo(hdr.width, 0);
			ctx.stroke();
		};

		loadError = originOfError;
		hdr = {
			width: gif.width,
			height: gif.height
		}; // Fake header.
		frames = [];
		drawError();
	};

	var doHdr = function (_hdr) {
		hdr = _hdr;
		canvas.width = hdr.width;
		canvas.height = hdr.height;
		toolbar.style.minWidth = hdr.width + 'px';

		tmpCanvas.width = hdr.width;
		tmpCanvas.height = hdr.height;
	};

	var doGCE = function (gce) {
		pushFrame();
		clear();
		transparency = gce.transparencyGiven ? gce.transparencyIndex : null;
		delay = gce.delayTime;
		disposalMethod = gce.disposalMethod;
		// We don't have much to do with the rest of GCE.
	};

	var pushFrame = function () {
		if (!frame) return;
		frames.push({
			data: frame.getImageData(0, 0, hdr.width, hdr.height),
			delay: delay
		});
	};

	var firstImg = false;;
	var firstCData = false;;

	var doImg = function (img) {
		if (!frame) frame = tmpCanvas.getContext('2d');
		var ct = img.lctFlag ? img.lct : hdr.gct; // TODO: What if neither exists?
		var cData = frame.getImageData(img.leftPos, img.topPos, img.width, img.height);

		img.pixels.forEach(function (pixel, i) {
			// cData.data === [R,G,B,A,...]
			if (transparency !== pixel) { // This includes null, if no transparency was defined.
				cData.data[i * 4 + 0] = ct[pixel][0];
				cData.data[i * 4 + 1] = ct[pixel][1];
				cData.data[i * 4 + 2] = ct[pixel][2];
				cData.data[i * 4 + 3] = 255; // Opaque.
			}
			else {
				// TODO: Handle disposal method properly.
				// XXX: When I get to an Internet connection, check which disposal method is which.
				if (lastDisposalMethod === 2 || lastDisposalMethod === 3) {
					cData.data[i * 4 + 3] = 0; // Transparent.
					// XXX: This is very very wrong.
				}
				else {
					// lastDisposalMethod should be null (no GCE), 0, or 1; leave the pixel as it is.
					// assert(lastDispsalMethod === null || lastDispsalMethod === 0 || lastDispsalMethod === 1);
					// XXX: If this is the first frame (and we *do* have a GCE),
					// lastDispsalMethod will be null, but we want to set undefined
					// pixels to the background color.
				}
			}
		});

		if (!firstImg) firstImg = img;
		if (!firstCData) firstCData = cData;

		frame.putImageData(cData, img.leftPos, img.topPos);

		if (!ctx_scaled)
		{
			ctx.scale(get_canvas_scale(),get_canvas_scale());
			ctx_scaled = true;
		}

		// We could use the on-page canvas directly, except that we draw a progress
		// bar for each image chunk (not just the final image).
		ctx.drawImage(tmpCanvas, 0, 0);

	};

	var player = (function () {
		var i = -1;
		var curFrame;
		var delayInfo;

		var showingInfo = false;
		var pinned = false;

		var stepFrame = function (delta) { // XXX: Name is confusing.
			i = (i + delta + frames.length) % frames.length;
			curFrame = i + 1;
			delayInfo = frames[i].delay;
			putFrame();
		};

		var step = (function () {
			var stepping = false;

			var doStep = function () {
				stepping = playing;
				if (!stepping) return;

				stepFrame(forward ? 1 : -1);
				var delay = frames[i].delay * 10;
				if (!delay) delay = 100; // FIXME: Should this even default at all? What should it be?
				setTimeout(doStep, delay);
			};

			return function () {
				if (!stepping) setTimeout(doStep, 0);
			};
		}());

		var putFrame = function () {
			curFrame = i;

			tmpCanvas.getContext("2d").putImageData(frames[i].data, 0, 0);

			ctx.drawImage(tmpCanvas, 0, 0);

		};

		var play = function () {
			playing = true;
			step();
		};

		var pause = function () {
			playing = false;
		};


		return {
			init: function () {
				if (loadError) return;

				ctx.scale(get_canvas_scale(),get_canvas_scale());

				if (options.auto_play) {
					step();
				}
				else {
					i = 0;
					putFrame();
				}
			},
			current_frame: curFrame,
			step: step,
			play: play,
			pause: pause,
			playing: playing,
			move_relative: stepFrame,
			current_frame: function() { return i; },
			length: function() { return frames.length },
			move_to: function ( frame_idx ) {
				i = frame_idx;
				putFrame();
			}
		}
	}());

	var doDecodeProgress = function (draw) {
		doShowProgress(stream.pos, stream.data.length, draw);
	};

	var doNothing = function () {};
	/**
	 * @param{boolean=} draw Whether to draw progress bar or not; this is not idempotent because of translucency.
	 *                       Note that this means that the text will be unsynchronized with the progress bar on non-frames;
	 *                       but those are typically so small (GCE etc.) that it doesn't really matter. TODO: Do this properly.
	 */
	var withProgress = function (fn, draw) {
		return function (block) {
			fn(block);
			doDecodeProgress(draw);
		};
	};

	var register_canvas_handers = function () {

			var maxTime = 1000,
				// allow movement if < 1000 ms (1 sec)
				maxDistance = Math.floor(canvas.width / (player.length() * 2)),
				// swipe movement of 50 pixels triggers the swipe
				startX = 0,
				startTime = 0;

			var cantouch = "ontouchend" in document;

			var aj = 0;
			var last_played = 0;

			var startup = function (e) {
				// prevent image drag (Firefox)
				e.preventDefault();
				if (options.auto_play) player.pause();

				var pos = (e.touches && e.touches.length > 0) ? e.touches[0] : e;

				var x = (pos.layerX > 0) ? pos.layerX : canvas.width / 2;
				var progress = x / canvas.width;

				player.move_to( Math.floor(progress * (player.length() - 1)) );
				
				startTime = e.timeStamp;
				startX = pos.pageX;
			};
			canvas.addEventListener((cantouch) ? 'touchstart' : 'mousedown', startup );

			var shutdown = function (e) {
				startTime = 0;
				startX = 0;
				if (options.auto_play) player.play();
			};
			canvas.addEventListener((cantouch) ? 'touchend' : 'mouseup', shutdown);

			var moveprogress = function (e) {
				e.preventDefault();
				var pos = (e.touches && e.touches.length > 0) ? e.touches[0] : e;

				var currentX = pos.pageX;
				currentDistance = (startX === 0) ? 0 : Math.abs(currentX - startX);
				// allow if movement < 1 sec
				currentTime = e.timeStamp;
				if (startTime !== 0 && currentDistance > maxDistance) {
					if (currentX < startX && player.current_frame() > 0) {
						player.move_relative(-1);
					}
					if (currentX > startX && player.current_frame() < player.length() - 1) {
						player.move_relative(1);
					}
					startTime = e.timeStamp;
					startX = pos.pageX;
				}

			};
			canvas.addEventListener((cantouch) ? 'touchmove' : 'mousemove', moveprogress);
		};


	var handler = {
		hdr: withProgress(doHdr),
		gce: withProgress(doGCE),
		com: withProgress(doNothing),
		// I guess that's all for now.
		app: {
			// TODO: Is there much point in actually supporting iterations?
			NETSCAPE: withProgress(doNothing)
		},
		img: withProgress(doImg, true),
		eof: function (block) {
			//toolbar.style.display = '';
			pushFrame();
			doDecodeProgress(false);
			canvas.width = hdr.width;
			canvas.height = hdr.height;
			player.init();
			loading = false;
			register_canvas_handers();
			if (load_callback)
			{
				load_callback();
			}

		}
	};

	var init = function () {
			var parent = gif.parentNode;

			var div = document.createElement('div');
			canvas = document.createElement('canvas');
			ctx = canvas.getContext('2d');
			toolbar = document.createElement('div');

			tmpCanvas = document.createElement('canvas');

			div.width = canvas.width = gif.width;
			div.height = canvas.height = gif.height;
			toolbar.style.minWidth = gif.width + 'px';

			div.className = 'jsgif';
			toolbar.className = 'jsgif_toolbar';
			div.appendChild(canvas);
			div.appendChild(toolbar);

			parent.insertBefore(div, gif);
			parent.removeChild(gif);

	};

	var get_canvas_scale = function() {
		if (options.max_width && canvas.width > options.max_width)
		{
			return options.max_width / canvas.width;
		}
		else
		{
			return 1;
		}

	}

	var canvas, ctx, toolbar, tmpCanvas;
	var initialized = false;
	var load_callback = false;

	return {
		// play controls
		play: player.play,
		pause: player.pause,
		move_relative: player.move_relative,
		move_to: player.move_to,

		// getters for instance vars
		get_playing: function() {
			return player.playing;
		},
		get_canvas: function() {
			return canvas;
		},
		get_loading: function() {
			return loading
		},
		get_auto_play: function() {
			return options.auto_play;
		},
		get_length: function() {
			return player.length();
		},
		get_current_frame: function() {
			return player.current_frame();
		},
		load: function (callback) {

			if (callback) load_callback = callback;
			loading = true;

			var h = new XMLHttpRequest();
			h.overrideMimeType('text/plain; charset=x-user-defined');
			h.onloadstart = function() {
				// Wait until connection is oppened to replace the gif element with a canvas to avoid a blank img
				if (!initialized ) init();
			};
			h.onload = function(e) {
				stream = new Stream(h.responseText);
				setTimeout(doParse, 0);
			};
			h.onprogress = function (e) {
				if (e.lengthComputable) doShowProgress(e.loaded, e.total, true);
			};
			h.onerror = function() { doLoadError('xhr'); };
			h.open('GET', gif.getAttribute('rel:animated_src') || gif.src, true);
			h.send();


		}
	};

};


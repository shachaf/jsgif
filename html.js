//var bookmarklet = function() {
var bookmarklet = function() {

 // INSERT_GIF_JS_HERE

  var playGIF = function(gif) {
    var stream;
    var hdr;

    var loadError = null;

    var transparency = null;
    var delay = null;
    var disposalMethod = null;
    var lastDisposalMethod = null;
    var frame = null;

    var playing = true;
    var forward = true;

    var frames = [];

    var clear = function() {
      transparency = null;
      delay = null;
      lastDisposalMethod = disposalMethod;
      disposalMethod = null;
      frame = null;
      //frame = tmpCanvas.getContext('2d');
    };

    // XXX: There's probably a better way to handle catching exceptions when
    // callbacks are involved.
    var doParse = function() {
        try {
          parseGIF(stream, handler);
        } catch(err) {
          doLoadError('parse');
        }
    };

    var doGet = function() {
      var h = new XMLHttpRequest();
      h.overrideMimeType('text/plain; charset=x-user-defined');
      h.onload = function(e) {
        //doLoadProgress(e);
        // TODO: In IE, might be able to use h.responseBody instead of overrideMimeType.
        stream = new Stream(h.responseText);
        setTimeout(doParse, 0);
      };
      h.onprogress = doLoadProgress;
      h.onerror = function() { doLoadError('xhr'); };
      h.open('GET', gif.src, true);
      h.send();
    };

    var doText = function(text) {
      toolbar.innerHTML = text; // innerText? Escaping? Whatever.
      //ctx.fillStyle = 'black';
      //ctx.font = '32px sans-serif';
      //ctx.fillText(text, 8, 32);
    };

    var doShowProgress = function(prefix, pos, length, draw) {
      //toolbar.style.display = pos === length ? 'none' : 'block';
      //toolbar.style.display = pos === length ? '' : 'block'; // FIXME Move this to doPlay() or something.
      toolbar.style.visibility = pos === length ? '' : 'visible'; // FIXME Move this to doPlay() or something.

      if (draw) {
        var height = Math.min(canvas.height >> 3, canvas.height);
        var top = (canvas.height - height) >> 1;
        var bottom = (canvas.height + height) >> 1;
        var mid = (pos / length) * canvas.width;

        // XXX Figure out alpha fillRect.
        //ctx.fillStyle = 'salmon';
        ctx.fillStyle = 'rgba(255,160,122,0.5)';
        ctx.fillRect(mid, top, canvas.width - mid, height);

        //ctx.fillStyle = 'teal';
        ctx.fillStyle = 'rgba(0,128,128,0.5)';
        ctx.fillRect(0, top, (pos / length) * canvas.width, height);
      }

      doText(prefix + ' ' + Math.floor(pos / length * 100) + '%');
    };

    var doLoadProgress = function(e) {
      // TODO: Find out what lengthComputable actually means.
      if (e.lengthComputable) doShowProgress('Loading...', e.loaded, e.total, true);
    };

    var doLoadError = function(originOfError) {
      var drawError = function() {
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
      hdr = {width: gif.width, height: gif.height}; // Fake header.
      frames = [];
      drawError();
      setTimeout(doPlay, 0);
    };

    var doHdr = function(_hdr) {
      hdr = _hdr;
      //console.assert(gif.width === hdr.width && gif.height === hdr.height); // See other TODO.

      canvas.width = hdr.width;
      canvas.height = hdr.height;
      div.style.width = hdr.width + 'px';
      //div.style.height = hdr.height + 'px';
      toolbar.style.minWidth = hdr.width + 'px';

      tmpCanvas.width = hdr.width;
      tmpCanvas.height = hdr.height;
      //if (hdr.gctFlag) { // Fill background.
      //  rgb = hdr.gct[hdr.bgColor];
      //  tmpCanvas.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',');
      //}
      //tmpCanvas.getContext('2d').fillRect(0, 0, hdr.width, hdr.height);
      // TODO: Figure out the disposal method business.
    };

    var doGCE = function(gce) {
      pushFrame();
      clear();
      transparency = gce.transparencyGiven ? gce.transparencyIndex : null;
      delay = gce.delayTime;
      disposalMethod = gce.disposalMethod;
      // We don't have much to do with the rest of GCE.
    };

    var pushFrame = function() {
      if (!frame) return;
      frames.push({data: frame.getImageData(0, 0, hdr.width, hdr.height),
                   delay: delay});
    };

    var doImg = function(img) {
      if (!frame) frame = tmpCanvas.getContext('2d');
      var ct = img.lctFlag ? img.lct : hdr.gct; // TODO: What if neither exists?

      var cData = frame.getImageData(img.leftPos, img.topPos, img.width, img.height);

      img.pixels.forEach(function(pixel, i) {
        // cData.data === [R,G,B,A,...]
        if (transparency !== pixel) { // This includes null, if no transparency was defined.
          cData.data[i * 4 + 0] = ct[pixel][0];
          cData.data[i * 4 + 1] = ct[pixel][1];
          cData.data[i * 4 + 2] = ct[pixel][2];
          cData.data[i * 4 + 3] = 255; // Opaque.
        } else {
          // TODO: Handle disposal method properly.
          // XXX: When I get to an Internet connection, check which disposal method is which.
          if (lastDisposalMethod === 2 || lastDisposalMethod === 3) {
            cData.data[i * 4 + 3] = 0; // Transparent.
            // XXX: This is very very wrong.
          } else {
            // lastDisposalMethod should be null (no GCE), 0, or 1; leave the pixel as it is.
            // assert(lastDispsalMethod === null || lastDispsalMethod === 0 || lastDispsalMethod === 1);
            // XXX: If this is the first frame (and we *do* have a GCE),
            // lastDispsalMethod will be null, but we want to set undefined
            // pixels to the background color.
          }
        }
      });
      frame.putImageData(cData, img.leftPos, img.topPos);
      // We could use the on-page canvas directly, except that we draw a progress
      // bar for each image chunk (not just the final image).
      ctx.putImageData(cData, img.leftPos, img.topPos);
    };

    var doPlay = (function() {
        var i = -1;
        var curFrame;  // XXX These two are <input> tags. They're declared up here
                       // instead of in initToolbar's scope so that stepFrame has
                       // access to them. This is hacky and should be eliminated.
                       // (Maybe this should actually be a class instead of a
                       // cheap plastic imitation? At the very least it should be
                       // abstracted more.)
        var delayInfo;


        var showingInfo = false;
        var pinned = false;

        var stepFrame = function(delta) { // XXX: Name is confusing.
          i = (i + delta + frames.length) % frames.length;
          curFrame.value = i + 1;
          delayInfo.value = frames[i].delay;
          putFrame();
        };

        var step = (function() {
          var stepping = false;

          var doStep = function() {
            stepping = playing;
            if (!stepping) return;

            stepFrame(forward ? 1 : -1);
            var delay = frames[i].delay * 10;
            if (!delay) delay = 100; // FIXME: Should this even default at all? What should it be?
            setTimeout(doStep, delay);
          };

          return function() { if (!stepping) setTimeout(doStep, 0); };
        }());

        var putFrame = function() {
          ctx.putImageData(frames[i].data, 0, 0);
        };

        var initToolbar = function() {
          // Characters.
          var right = '&#9654;';
          var left = '&#9664;';
          var bar = '&#10073;';
          var rarr = '&rarr;';
          var larr = '&larr;';
          var xsign = '&#10006;';
          //var infosource = '&#8505;';
          var circle = '&#9675;';
          var circledot = '&#8857;';
          //var blackSquare = '&#9632;'; // XXX
          //var doubleVerticalLine = '&#8214;'; // XXX
          var nearr = '&nearr;';
          // Buttons.
          var playIcon = right;
          var pauseIcon = bar + bar;
          var revplayIcon = left;
          var prevIcon = left + bar;
          var nextIcon = bar + right;
          //var showInfoIcon = infosource;
          var showInfoIcon = 'i'; // Fonts.
          var revIcon = larr;
          var revrevIcon = rarr;
          var closeIcon = xsign;
          var pinIcon = circledot;
          var unpinIcon = circle;
          var popupIcon = nearr;

          /**
           * @param{Object=} attrs Attributes (optional).
           */ // Make compiler happy.
          var elt = function(tag, cls, attrs) {
            var e = document.createElement(tag);
            if (cls) e.className = 'jsgif_' + cls;
            for (var k in attrs) {
              e[k] = attrs[k];
            }
            return e;
          };

          var simpleTools = elt('div', 'simple_tools');
          var rev = elt('button', 'rev');
          var showInfo = elt('button', 'show_info');
          var prev = elt('button', 'prev');
          var playPause = elt('button', 'play_pause');
          var next = elt('button', 'next');
          var pin = elt('button', 'pin');
          var close = elt('button', 'close');

          var infoTools = elt('div', 'info_tools');
          curFrame = elt('input', 'cur_frame', {type: 'text'}); // See above.
          delayInfo = elt('input', 'delay_info', {type: 'text'}); // See above.

          var updateTools = function() {
            if (playing) {
              playPause.innerHTML = pauseIcon;
                playPause.title = 'Pause'
              prev.style.visibility = 'hidden'; // See TODO.
              next.style.visibility = 'hidden';
            } else {
              playPause.innerHTML = forward ? playIcon : revplayIcon;
                playPause.title = 'Play';
              prev.style.visibility = '';
              next.style.visibility = '';
            }

            toolbar.style.visibility = pinned ? 'visible' : ''; // See TODO.

            infoTools.style.display = showingInfo ? '' : 'none'; // See TODO.

            showInfo.innerHTML = showInfoIcon;
              showInfo.title = 'Show info/more tools'
            rev.innerHTML = forward ? revIcon : revrevIcon;
              rev.title = forward ? 'Reverse' : 'Un-reverse';
            prev.innerHTML = prevIcon;
              prev.title = 'Previous frame';
            next.innerHTML = nextIcon;
              next.title = 'Next frame'
            pin.innerHTML = pinned ? unpinIcon : pinIcon;
              pin.title = pinned ? 'Unpin' : 'Pin';
            close.innerHTML = closeIcon;
              close.title = 'Close jsgif and go back to original image';

            curFrame.disabled = playing;
            delayInfo.disabled = playing;

            toolbar.innerHTML = '';
            simpleTools.innerHTML = '';
            infoTools.innerHTML = '';

            var t = function(text) { return document.createTextNode(text); };

            if (frames.length < 2) { // XXX
              // Also, this shouldn't actually be playing in this case.
              // TODO: Are we going to want an info tool that'll be displayed on static GIFs later?

              if (loadError == 'xhr') {
                toolbar.appendChild(t("Load failed; cross-domain? "));

                var popup = elt('button', 'popup');
                popup.addEventListener('click', function() { window.open(gif.src); } );
                popup.innerHTML = popupIcon;
                  popup.title = 'Click to open GIF in new window; try running jsgif there instead';
                toolbar.appendChild(popup);
              } else if (loadError == 'parse') {
                toolbar.appendChild(t("Parse failed "));
              }

              toolbar.appendChild(close);

              return;
            }

            // We don't actually need to repack all of these -- that's left over
            // from before -- but it doesn't especially hurt either.
            var populate = function(elt, children) {
              elt.innerHTML = '';
              children.forEach(function(c) { elt.appendChild(c); });
              //children.forEach(elt.appendChild); // Is this a "pseudo-function"?
            };

            // XXX Blach.
            var simpleToolList = forward ? [showInfo, rev, prev, playPause, next, pin, close]
                                         : [showInfo, rev, next, playPause, prev, pin, close];
            populate(toolbar, [simpleTools, infoTools]);
            populate(simpleTools, simpleToolList);
            populate(infoTools, [t(' frame: '), curFrame, t(' / '), t(frames.length), t(' (delay: '), delayInfo, t(')')]);
          };

          var doRev = function() {
            forward = !forward;
            updateTools();
            rev.focus(); // (because repack)
          };

          var doNextFrame = function() { stepFrame(1); };
          var doPrevFrame = function() { stepFrame(-1); };

          var doPlayPause = function() {
            playing = !playing;
            updateTools();
            playPause.focus(); // In case this was called by clicking on the
                               // canvas (we have to do this here because we
                               // repack the buttons).
            step();
          };

          var doCurFrameChanged = function() {
            var newFrame = +curFrame.value;
            if (isNaN(newFrame) || newFrame < 1 || newFrame > frames.length) {
              // Invalid frame; put it back to what it was.
              curFrame.value = i + 1;
            } else {
              i = newFrame - 1;
              putFrame();
            }
          };

          var doCurDelayChanged = function() {
            var newDelay = +delayInfo.value;
            if (!isNaN(newDelay)) {
              frames[i].delay = newDelay;
            }
          };

          var doToggleShowingInfo = function() {
            showingInfo = !showingInfo;
            updateTools();
            showInfo.focus(); // (because repack)
          };

          var doTogglePinned = function() {
            pinned = !pinned;
            updateTools();
            pin.focus(); // (because repack)
          };

          // TODO: If the <img> was in an <a>, every one of these will go to the
          // URL. We don't want that for the buttons (and probably not for
          // anything?).
          showInfo.addEventListener('click', doToggleShowingInfo, false);
          rev.addEventListener('click', doRev, false);
          curFrame.addEventListener('change', doCurFrameChanged, false);
          prev.addEventListener('click', doPrevFrame, false);
          playPause.addEventListener('click', doPlayPause, false);
          next.addEventListener('click', doNextFrame, false);
          pin.addEventListener('click', doTogglePinned, false);
          close.addEventListener('click', doClose, false);

          delayInfo.addEventListener('change', doCurDelayChanged, false);

          canvas.addEventListener('click', doPlayPause, false);

          // For now, to handle GIFs in <a> tags and so on. This needs to be handled better, though.
          div.addEventListener('click', function(e) { e.preventDefault(); }, false);

          updateTools();
        };

        return function() {
          setTimeout(initToolbar, 0);
          if (loadError) return;
          canvas.width = hdr.width;
          canvas.height = hdr.height;
          step();
        };
    }());

    var doClose = function() {
      playing = false;
      parent.insertBefore(gif, div);
      parent.removeChild(div);
    };

    var doDecodeProgress = function(draw) {
      doShowProgress('Decoding (frame ' + (frames.length + 1) + ')...', stream.pos, stream.data.length, draw);
    };

    var doNothing = function(){};
    /**
     * @param{boolean=} draw Whether to draw progress bar or not; this is not idempotent because of translucency.
     *                       Note that this means that the text will be unsynchronized with the progress bar on non-frames;
     *                       but those are typically so small (GCE etc.) that it doesn't really matter. TODO: Do this properly.
     */
    var withProgress = function(fn, draw) {
      return function(block) {
        fn(block);
        doDecodeProgress(draw);
      };
    };


    var handler = {
      hdr: withProgress(doHdr),
      gce: withProgress(doGCE),
      com: withProgress(doNothing), // I guess that's all for now.
      app: {
       // TODO: Is there much point in actually supporting iterations?
        NETSCAPE: withProgress(doNothing)
      },
      img: withProgress(doImg, true),
      eof: function(block) {
        //toolbar.style.display = '';
        pushFrame();
        doDecodeProgress(false);
        doText('Playing...');
        doPlay();
      }
    };

    var parent = gif.parentNode;

    var div = document.createElement('div');
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var toolbar = document.createElement('div');

    var tmpCanvas = document.createElement('canvas');

    // Copy the computed style of the <img> to the <div>. The CSS specifies
    // !important for all its properties; this still has a few issues, but it's
    // probably preferable to not doing it. XXX: Maybe this should only copy a
    // few specific properties (or specify properties more thoroughly in the
    // CSS)?
    // (If we don't hav getComputedStyle we'll have to get along without it, of
    // course. It's not as if this supports IE, anyway, though, so I don't know
    // if that really matters.)
    //
    // XXX: Commented out for now. If uncommenting, make sure to add !important
    // to all the CSS properties in jsgif.css
    //
    //if (window.getComputedStyle) {
    //  for (var s in window.getComputedStyle(gif)) {
    //    div.style[s] = gif.style[s];
    //  }
    //}

    // This is our first estimate for the size of the picture. It might have been
    // changed so we'll correct it when we parse the header. TODO: Handle zoom etc.
    canvas.width = gif.width;
    canvas.height = gif.height;
    toolbar.style.minWidth = gif.width + 'px';

    div.className = 'jsgif';
    toolbar.className = 'jsgif_toolbar';
    div.appendChild(canvas);
    div.appendChild(toolbar);

    parent.insertBefore(div, gif);
    parent.removeChild(gif);

    doText('Loading...');
    doGet();
  };

  var bookmarkletCSS = '/* INSERT_CSS_HERE */';

  var insertCSS = function(css) { // Surely there's a much better way of handling this whole thing.
    // XXX: If there isn't a better way of handling this: Should we remove the <style> tag when the bookmarklet is done?
    var style = document.createElement('style');
    style.type = 'text/css';
    style.textContent = css; // See TODO.
    document.body.appendChild(style);
  };

  var to_a = function(pseudoList) { // Blagh, delicious DOM. I'll do this for now.
    var a = [];
    for (var i = 0; i < pseudoList.length; i++) {
      a.push(pseudoList[i]);
    }
    return a;
  };

  // There *has* to be a better way of doing this. This is just... Temporary. That's right, temporary.
  var join = function(strings, between) {
    if (between === undefined) between = '';
    return strings.reduce(function(s, n) { return s + between + n; }, '');
  };
  var elemClasses = function(elem) {
    return elem.className.split(/\s/);
  };
  var addClass = function(elem, cls) {
    elem.className += ' ' + cls;
  };
  var removeClass = function(elem, cls) {
    var classes = elemClasses(elem).filter(function(_cls) { return _cls !== cls; });
    elem.className = join(classes, ' ');
  };

  var imgs = to_a(document.getElementsByTagName('img'));
  var gifs = imgs.filter(function(img) {
    return img.src.slice(-4).toLowerCase() === '.gif';
    // This is a very cheap plastic imitation of checking the MIME type -- I've
    // seen GIFs with no extension (or, even worse, ending in .jpg). I can't
    // see a good way of figuring out if an image is a GIF, though, so this
    // will have TODO for now.
  });
  // Partial workaround: If there were no .gif images, we'll just try all the <img> tags.
  if (gifs.length === 0) gifs = imgs;

  var clicked = function(e) {
    var gif = this; // eventListener context
    gifs.forEach(rmOverlay);
    setTimeout(function() { playGIF(gif); }, 0);
    e.preventDefault();
  };

  var mkOverlay = function(gif) {
    if (elemClasses(gif).indexOf('jsgif_overlaid') !== -1) return; // Idempotent.
    addClass(gif, 'jsgif_overlaid');
    gif.addEventListener('click', clicked, false);
  };

  var rmOverlay = function(gif) {
    // XXX: What if the bookmarklet was run more than once?
    removeClass(gif, 'jsgif_overlaid');
    gif.removeEventListener('click', clicked, false);
  };

  //var clicked = function() {
  //  var gif = overlay_to_gif(this);
  //  gifs.forEach(rmOverlay);
  //  setTimeout(function() { playGIF(gif); }, 0);
  //};

  //var mkOverlay = function(gif) {
  //  var overlayOuter = document.createElement('div');
  //  overlayOuter.className = 'jsgif_overlay_outer';
  //  var overlayInner = document.createElement('div');
  //  overlayInner.className = 'jsgif_overlay_inner';
  //  var parent = gif.parentNode;
  //  parent.insertBefore(overlayOuter, gif);
  //  parent.removeChild(gif);
  //  overlayOuter.appendChild(gif);
  //  overlayOuter.appendChild(overlayInner);
  //  overlayInner.addEventListener('click', clicked, false);
  //};

  //var clearOverlay = function(gif) {
  //  var overlayOuter = gif.parentNode;
  //  var parent = overlayOuter.parentNode;
  //  overlayOuter.removeChild(gif);
  //  parent.insertBefore(gif, overlayOuter);
  //  parent.removeChild(overlayOuter);
  //};

  //var overlay_to_gif = function(overlayInner) {
  //  // We get overlayInner because that's what the event handler is on.
  //  return overlayInner.previousSibling;
  //};

  insertCSS(bookmarkletCSS);

  // XXX: In retrospect, this behavior is more confusing than useful.
  //if (gifs.length === 1) {
  //  setTimeout(function() { playGIF(gifs[0]); }, 0);
  //  return;
  //}

  gifs.forEach(mkOverlay);
};

// So here we take advantage of the fact that we didn't tell Closure that we're
// exporting this function, which means we can do "var b = ...; b();" and it'll
// handle it correctly.
// This used to be even more convoluted.

// BEGIN_NON_BOOKMARKLET_CODE
/*
// END_NON_BOOKMARKLET_CODE
bookmarklet();
// BEGIN_NON_BOOKMARKLET_CODE
*/
// END_NON_BOOKMARKLET_CODE

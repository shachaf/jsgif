#!/usr/bin/env node

function lzwDecode(minCodeSize, data) {
  var pos = 0;

  function readCode(size) {
    var code = 0;
    for (var i = 0; i < size; i++) {
      if (data.charCodeAt(pos >> 3) & (1 << (pos % 8))) {
        code |= 1 << i;
      }
      pos++;
    }
    return code;
  }

  var output = [];

  var clearCode = 1 << minCodeSize;
  var eoiCode = clearCode + 1;

  var codeSize = minCodeSize + 1;

  var dict = [];

  function clear() {
    dict = [];
    codeSize = minCodeSize + 1;
    for (var i = 0; i < clearCode; i++) {
      dict[i] = [i];
    }
    dict[clearCode] = [];
    dict[eoiCode] = null;

  }

  var code;
  var last;

  while (true) {
    last = code;
    code = readCode(codeSize);

    if (code == clearCode) {
      clear();
      continue;
    }
    if (code == eoiCode) break;

    if (code < dict.length) {
      if (last != clearCode) {
        dict.push(dict[last].concat(dict[code][0]));
      }
    } else {
      console.assert(code == dict.length);
      dict.push(dict[last].concat(dict[last][0]));
    }
    output.push.apply(output, dict[code]);

    if (dict.length == (1 << codeSize) && codeSize < 12) {
      // If we're at the last code and codeSize is 12, the next code will be a clearCode, and it'll be 12 bits long.
      codeSize++;
    }
  }

  console.assert((pos >> 3) + !!(pos % 8) == data.length);
  return output;
}






var tiny = [68,1]; // 2
var wiki = [0,81,8,28,72,176,160,193,131,8,15,254,91,200,176,161,67,135,9,7,62,156,56,49,162,64,138,24,25,90,68,145,49,227,198,142,24,63,130,172,104,113,36,201,136,38,31,138,76,169,177,36,203,150,30,19,198,140,137,112,102,72,153,55,105,42,204,121,179,38,79,138,40,127,158,220,9,148,99,79,162,36,117,26,180,89,212,103,209,151,35,47,66,237,40,117,170,80,171,42,141,98,77,186,149,107,87,136,90,191,194,20,219,176,42,217,127,102,201,166,21,187,246,107,219,174,111,183,198,197,58,215,106,221,169,119,161,230,125,185,151,101,223,148,127,77,6,142,26,86,109,97,182,135,221,38,134,187,88,110,99,186,27,35,31,12,8] // 8
var sg = require('./gif').parseGIF(require('fs').readFileSync('dollar.gif').toString('binary'));
var sgl = sg.blocks[1].lzwBlocks.reduce(function(s,n) { return s + n.data; }, '');

function sofa(a) {
  return a.reduce(function(s,n) { return s + String.fromCharCode(n); }, '');
}

console.log(
    //lzwDecode(2, sofa(tiny))
    //lzwDecode(2, "D\x01")
    //lzwDecode(8, sofa(wiki))
    lzwDecode(sg.blocks[1].lzwMinCodeSize, sgl)
)

//x = lzwDecode(8, sofa(wiki));
//for (var i = 0; i < x.length; i++) {
//  //if (x[i] == 255) continue;
//  console.log(x[i]);
//}

// Stream
var Stream = function(data) {
  this.data = data;
  this.len = this.data.length;
  this.pos = 0;

  this.read = function(n) {
    if (this.pos + n > this.data.length)
      throw new Error("Attempted to read past end of stream.");
    return this.data.substring(this.pos, this.pos += n);
  }

  this.readToEnd = function() {
    return this.read(this.data.length - this.pos);
  }

  this.readBytes = function(n) {
    var s = this.read(n);
    var a = [];
    for (var i = 0; i < s.length; i++) {
      a.push(s.charCodeAt(i));
    }
    return a;
  }

  this.readByte = function() {
    return this.readBytes(1)[0];
  }

  this.readUnsigned = function() { // Little-endian.
    var a = this.readBytes(2);
    return (a[1] << 8) + a[0];
  }
}

if (typeof exports != 'undefined') {
  exports.Stream = Stream;
}

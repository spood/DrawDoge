$( document ).ready(function() {

  var showDoges = true;
  var drawSize = $("input[type='radio'][name='radioSizeDoges']:checked").val();

$("input:radio[name='radioSizeDoges']").click(function() {
  drawSize = parseInt($(this).val());
});

$("#showShibes").change(function() {
  if(this.checked) {
    showDoges = true;
  }
  else {
    showDoges = false;
  }
});

  $(function () {
      $('#popNotice').popover();
  });

  var curColor = '#000000';
  $('#colorpickerHolder').ColorPicker({
    flat: true,
    color: '#000000',
	  onChange: function (hsb, hex, rgb) {
		  curColor =  '#' + hex;
	  }
  });

  $(".alert").alert();

  $('#createAccount').on('click', function (e) {
      $('#confirm').modal({show:true});
  });

  $("#createAccountFinal").click(function() {
    var username = $("#accountUsername").val();
    var password1 = $("#accountPassword").val();
    var password2 = $("#accountPassword2").val();
    var email = $("#accountEmail").val();
    var dataString = 'username='+ username + '&password1=' + password1 + '&password2=' + password2 + '&email=' + email;
    $.ajax({
      type: "POST",
      url: "/createAccount",
      data: dataString,
      success: function(data) {
        if (data.redirect) {
          $('#confirm').modal({show:false});
          window.location.href = data.redirect;
        }
        else {
          $('#errorLabel').text(data.msg);
        }
      }
    });
    return false;
  });

  var canvasImg = new Image();

  var img = new Image();
  var lastX = 0;
  var lastY = 0;
  img.src = 'images/doge.png';
  var context = document.getElementById("playerCanvas").getContext('2d');

   
  $('#selectColor').change(function () {
    curColor = $('#selectColor option:selected').val();
  });
   
  // drawdoge.com:5000
  var socket = io.connect('http://localhost');
  var otherDoges;
  var name = 'User' + Math.round(Math.random() * 255);
  var r = Math.round(Math.random() * 255);
  var g = Math.round(Math.random() * 255);
  var b = Math.round(Math.random() * 255);


  var pl =
  {
    id: 0,
    name: name,
    x: 0,
    y: 0
  };
  
  socket.on('connect', function () {
    socket.emit('client_connected', pl);
  });

  var testCanvas = document.getElementById("testCanvas");
  var serverCanvas = document.getElementById("serverCanvas");
  var drawCanvas = document.getElementById("drawCanvas");
  {
    var isDown      = false;
    var ctx = drawCanvas.getContext("2d");
    var canvasX, canvasY;
    
    var points = [];
    $("#playerCanvas")
    .mousedown(function(e){
      if($('#balance').length != 0){
        ctx.lineWidth = drawSize;
        isDown = true;
        points = [];
        ctx.beginPath();
        position = getPosition(e);
        points.push( [position.x,position.y]);
        ctx.moveTo(position.x, position.y);
      }
    })
    .mousemove(function(e){
      position = getPosition(e);
      lastX = position.x;
      lastY = position.y;
      if(isDown != false) {
        ctx.lineTo(position.x, position.y);
        ctx.strokeStyle = curColor;
        ctx.stroke();
        points.push( [position.x,position.y]);
        if(points.length >= 1000) {
          isDown = false;
          ctx.closePath();
          sendStroke(curColor, ctx.lineWidth, points);
        }
      }
    })
    .mouseup(function(e){
      if($('#balance').length != 0){
        isDown = false;
        ctx.closePath();
        sendStroke(curColor, ctx.lineWidth, points);
      }
    });
  }

function sendStroke(color, width, point) {
  var msg = {
    'id': pl.id,
    'color': color,
    'strokeWidth': width,
    'points': point
  };
  socket.emit('send_stroke', msg);
}

  if(testCanvas) {
    var testDown = false;
    var canvasX, canvasY;
    var testctx = testCanvas.getContext("2d");
    var testPoints = [];
    $("#testCanvas")
    .mousedown(function(e){
      testctx.lineWidth = drawSize;
      testDown = true;
      testctx.beginPath();
      position = getPosition(e);
      testctx.moveTo(position.x, position.y);
      testPoints.push([position.x, position.y]);
    })
    .mousemove(function(e){
      position = getPosition(e);
      if(testDown != false) {
        testctx.lineTo(position.x, position.y);
        testctx.strokeStyle = curColor;
        testctx.stroke();
        testPoints.push([position.x, position.y]);
      }
    })
    .mouseup(function(e){
      testDown = false;
      testctx.closePath();
      var dogeCost = calcDogeCost(testPoints, 5);
      $('#costLabel').text("Stroke would cost " + dogeCost + " dogecoins");
      testPoints = [];
    });
  }

  var mouseCounter = 0;
  $('#playerCanvas').mousemove(function(event) {
    // don't start sending coordinates until js has generate a json for yourself
    if(pl) {
      mouseCounter++;
      // only send an update after moving at least 10 pixels, reduce on transfer of small mouse movement
      if(mouseCounter >= 10) {
        var pos = {
          x: event.pageX,
          y: event.pageY- 128
        };
        socket.emit('update_coords', pos);
        mouseCounter = 0;
      }
    }
  });

  socket.on('canvas', function(data) {
    // draw initial canvas image
    var ctx = serverCanvas.getContext("2d");
    canvasImg.onload = function() {
        ctx.drawImage(canvasImg, 0, 0);
    };
    pl.id = data.id;
    canvasImg.src = data.img;
  });

  socket.on('update_stroke', function(data) {
    for (var k = 0; k < data.length; k++) {
      var ctx = serverCanvas.getContext("2d");
      var drawctx = drawCanvas.getContext("2d");
      drawctx.clearRect(0,0,1660,768);
      var color = data[k].color;
      ctx.lineWidth = data[k].strokeWidth;
      ctx.beginPath();
      var i=0;
      while(i < data[k].points.length) {
        ctx.lineTo(data[k].points[i][0], data[k].points[i][1]);
        ctx.strokeStyle = color;
        ctx.stroke();
        i++;
      }
      ctx.closePath();
    }
  });

  socket.on('send_data', function(data){
    var data=data;
    otherDoges = data;
  });

  socket.on('drawproblem', function(data) {
    var problem = data.problem;
    if(problem == 1) {
      var bal = data.balance;
      var cost = data.cost;
      $('#popNotice').css('visibility', 'visible');
      $('#popNotice').popover('show');
      var drawctx = drawCanvas.getContext("2d");
      drawctx.clearRect(0,0,1660,768);
    }
  });

  socket.on('newbalance', function(balance){
    $('#balance').text('Balance: ' + balance);
    if(balance <= 0.00) {
      $('#popNotice').css('visibility', 'visible');
      $('#popNotice').popover('show');
      var drawctx = drawCanvas.getContext("2d");
      drawctx.clearRect(0,0,1660,768);
    }
    else {
      $('#popNotice').css('visibility', 'hidden');
      $('#popNotice').popover('hide');
    }
  });
  
    function draw() {
      return drawHandle = setInterval(function(){
        if(showDoges) {
          context.clearRect(0,0,1660,768);
          // draw your shibe
          context.drawImage(img, lastX, lastY);
          var i=0;
          if(otherDoges) {
              while(i < otherDoges.length)
              {
                var me = '';
                // dont draw yourself from server, it would update too slow
                if( otherDoges[i].name == pl.name ) {
                  i++;
                  continue;
                }
                // draw other shibes
                context.drawImage(img, otherDoges[i].x, otherDoges[i].y);
                i++;
              }
          }
        }
        else {
          context.clearRect(0,0,1660,768);
        }
      }, 100);
    }
    draw();
});

// from http://stackoverflow.com/a/6551032
function getPosition(e) {

    //this section is from http://www.quirksmode.org/js/events_properties.html
    var targ;
    if (!e)
        e = window.event;
    if (e.target)
        targ = e.target;
    else if (e.srcElement)
        targ = e.srcElement;
    if (targ.nodeType == 3) // defeat Safari bug
        targ = targ.parentNode;

    // jQuery normalizes the pageX and pageY
    // pageX,Y are the mouse positions relative to the document
    // offset() returns the position of the element relative to the document
    var x = e.pageX - $(targ).offset().left;
    var y = e.pageY - $(targ).offset().top;

    return {"x": x, "y": y};
};

function calcDogeCost(points,size) {
  var i = 0;
  var totalDistance = 0;
  while(i < points.length) {
    var point1 = points[i];
    i++;
    if(i < points.length) {
      var point2 = points[i];
      totalDistance += lineDistance(point1, point2);
    }
  }
  var cost = ((totalDistance / 1000) * size).toFixed(2);
  if(cost < 0.01) {
    cost = "0.01";
  }
  return cost;
}

function lineDistance( point1, point2 )
{
  var xs = 0;
  var ys = 0;
   
  xs = point2[0] - point1[0];
  xs = xs * xs;
   
  ys = point2[1] - point1[1];
  ys = ys * ys;
   
  return Math.sqrt( xs + ys );
}


let cnv;

// render the painting and visuals separately
let bufferGraphics;
let uiGraphics;

// background color settings
let bgHue = 0;
let bgChroma = 0.0;
let bgLuminance = 0.8;

// reference of previous brush settings for relative change
let refX;
let refY;
let refHue;
let refVar;
let refChroma;
let refLuminance;
let refSize;
let gadgetRadius; // based on canvas size

// current brush settings for drawing
let brushHue = 0;
let brushVar = 80;
let brushChroma = 0.2;
let brushLuminance = 0.7;
let brushSize = 200;
let brushTool = "Stamp Tool"
let texture = "Rounded"

// menu
let toolPresets = [
  {brush: "Stamp Tool", texture: "Rounded", menuName: "Rounded"},
  {brush: "Stamp Tool", texture: "Rake", menuName: "Rake"},
  {brush: "Line Tool", texture: undefined, menuName: "Line"},
  {brush: "Fan Line Tool", texture: undefined, menuName: "Line F"},
];
let toolMenuOpened = false;

// save 128 random 0-1 values here for consistent noise that stays between redraws
let varStrengths = [];

// control
let visited = false;
let useMouse = false;
let ongoingTouches = []; 
let penX; 
let penY;
let penStartX;
let penStartY;
let wasDown = false;
let penDown = false;
let penAngle = undefined;
let penPressure = undefined;
let fingersDown = 0;
let wiplog = "";

// touch control state
const fingerState = {
  peakCount: 0,
  canDecreaseCount: false
}


function setup() {
  cnv = createCanvas(windowWidth - 10, windowHeight - 10);
  cnv.touchStarted(handleTouchStart);
  cnv.touchMoved(handleTouchMove);
  cnv.touchEnded(handleTouchEnd);
  noLoop();

  gadgetRadius = min(width, height) / 8;
  penX = width/2;
  penY = height/2;
  refX = penX;
  refY = penY;

  // Create a graphics buffer for the painting
  bufferGraphics = createGraphics(width, height);
  if ((width * displayDensity()) > 3000) {
    bufferGraphics.pixelDensity(1);
  }
  bufferGraphics.background(okhex(bgLuminance, bgChroma, bgHue));
  document.body.style.backgroundColor = okhex(bgLuminance*0.9, bgChroma*0.5, bgHue);

  // Create a graphics buffer for the indicator
  uiGraphics = createGraphics(width, height);
  uiGraphics.strokeWeight(6);
  uiGraphics.textSize((width < height) ? 13 : 16);
  uiGraphics.textFont("monospace");
  uiGraphics.textAlign(LEFT, CENTER);

  // new random noise
  varStrengths = Array.from({ length: 128 }, () => random());
  
  updateUI();
  draw();
}

function windowResized() {
  resizeCanvas(windowWidth - 10, windowHeight - 10);
  draw();
}


function handleTouchStart(event) {
  event.preventDefault();
  event.changedTouches.forEach((touch) => {
    ongoingTouches.push(copyTouch(touch));
  });
  visited = true;
  updateInput(event);
  draw();
}
function handleTouchMove(event) { 
  event.preventDefault();
  event.changedTouches.forEach((touch) => {
    let idx = ongoingTouchIndexById(touch.identifier);
    if (idx >= 0) {
      ongoingTouches.splice(idx, 1, copyTouch(touch)); // swap in the new touch record
    }
  });
  updateInput(event);
  draw();
}
function handleTouchEnd(event) { 
  event.preventDefault();
  event.changedTouches.forEach((touch) => {
    let idx = ongoingTouchIndexById(touch.identifier);
    ongoingTouches.splice(idx, 1); // remove it; we're done
  });
  if (event.touches.length === 0) {
    ongoingTouches = [];
    print("all fingers lifted")
  }
  updateInput(event);
  draw();
}
function copyTouch({identifier, clientX, clientY, force, touchType, azimuthAngle}) {
  return {identifier, clientX, clientY, force, touchType, azimuthAngle};
}

function ongoingTouchIndexById(idToFind) {
  for (let i = 0; i < ongoingTouches.length; i++) {
    const id = ongoingTouches[i].identifier;

    if (id === idToFind) {
      return i;
    }
  }
  return -1; // not found
}

function mousePressed(event) {
  visited = true;
  if (useMouse) {
    updateInput(event);
    draw();
  }
}
function mouseMoved(event) {
  useMouse = true;
  updateInput(event);
  draw();
}
function mouseDragged(event) {
  visited = true;
  if (useMouse) {
    updateInput(event);
    draw();
  }
}
function mouseReleased(event) {
  if (useMouse) {
    updateInput(event);
    draw();
  }
}

function updateInput(event) {

  // menu first
  const menuW = 100;
  const menuH = 60 + ((toolMenuOpened) ? 60 * toolPresets.length : 0);
  
  function inMenu(x, y) {
    if (x < menuW && y < menuH) {
      if (event.type === "mousedown" || event.type === "touchstart") {
        const spot = Math.floor(y/60) - 1;
        if (spot >= 0) {
          brushTool = toolPresets[spot].brush;
          texture = toolPresets[spot].texture;
        } else {
          toolMenuOpened = !toolMenuOpened;
        }
      }
      return true;
    }
  }

  // update touches/mouse
  wasDown = penDown;
  fingersDown = 0;
  //wiplog += event.type + event.changedTouches[0].identifier + " "

  // first get the touches/mouse position
  if (ongoingTouches.length === 0 && mouseX !== undefined && mouseY !== undefined && useMouse) {
    if (inMenu(mouseX, mouseY)) return;
    penX = mouseX;
    penY = mouseY;
    
    if (event.type === "mousedown") {
      penDown = true;
    } else if (event.type === "mouseup") {
      penDown = false;
    }
  } else {
    // find pencil and count other touches
    // assuming apple pencil, using touchType property
    let containedPen = false;
    ongoingTouches.forEach((touch) => {
      if (inMenu(touch.clientX, touch.clientY)) return;
      if (touch.touchType !== "stylus") {
        fingersDown++;
      } else {
        // must be Pencil
        penX = touch.clientX;
        penY = touch.clientY;
        containedPen = true;
        penAngle = touch.azimuthAngle;
        penPressure = touch.force;
      }
    });
    penDown = containedPen;
  }

  // update state based on the result

  if (event === undefined) return;

  // pen down
  if ((event.type === "touchstart" || event.type === "mousedown") && penDown) {
    penStartX = penX;
    penStartY = penY;
    return;
  }

  // tap
  if (event.type === "touchstart" && !penDown) {
    if (fingerState.canDecreaseCount) {
      fingerState.peakCount = (fingersDown > fingerState.peakCount) ? fingersDown : 0;
      fingerState.canDecreaseCount = false; //false;
    } else {
      fingerState.peakCount = max(fingerState.peakCount, fingersDown);
    }
    penStartX = undefined;
    penStartY = undefined;
    return;
  }

  // pen lifted
  if (wasDown && !penDown && fingersDown === 0) {
    fingerState.peakCount = 0;
    fingerState.canDecreaseCount = false;

    // save the last drawing position as the ref
    // WIP WAS BROKEN LAST TESTING
    // if (fingerState.peakCount === 0) {
    //   refX = penX;
    //   refY = penY;
    // }

    return;
  }

  // last finger lifted
  if ((event.type === "touchend" && ongoingTouches.length === 0) || event.type === "touchcancel") {
    // was in a mode
    if (fingerState.peakCount > 0) {
      // now that there are no touches, the next tap can set the mode to 0 if it's less fingers than the last
      fingerState.canDecreaseCount = true; 
    }
    return;
  }
}

function keyPressed() {
  visited = true;
  if (key === "c") {
    bgLuminance = brushLuminance;
    bgChroma = brushChroma;
    bgHue = brushHue;

    bufferGraphics.background(okhex(bgLuminance, bgChroma, bgHue));
    document.body.style.backgroundColor = okhex(bgLuminance*0.9, bgChroma*0.5, bgHue);

    //fix the current brush color so it's visible
    if (brushLuminance > 0.5) {
      brushLuminance -= 0.05;
    } else {
      brushLuminance += 0.05;
    }
  } else if (key === "s") {
    saveCanvas(bufferGraphics, "drawlab-canvas", "png");
  }
  if (key !== undefined) draw();
}

function keyReleased() {
  updateUI();
  draw();
}


function inputMode() {
  //'1', luminance and chroma 
  if (keyIsDown(49) || (fingerState.peakCount === 1 && fingersDown === 0)) {
    return "lc";
  }
  //'2', hue
  if (keyIsDown(50) || (fingerState.peakCount === 2 && fingersDown === 0)) {
    return "hue";
  }
  //'3', size
  if (keyIsDown(51) || (fingerState.peakCount === 3 && fingersDown === 0)) {
    return "size";
  }
  return "draw";
}

function draw() {

  if (uiGraphics === undefined) return;

  // update the reference position
  if (inputMode() === "lc" || inputMode() === "hue" || inputMode() === "size") { //keys '1', '2', '3'
    // starting position
    // with touch, this is instead recorded when ending a brushstroke 
    // WIP NOT IMPLEMENTED AS SUCH, DONT DO THESE LINES IF USING TOUCH/PENCIL...lead to broken results last time however
    if (refX === undefined) refX = penX;
    if (refY === undefined) refY = penY;
    // starting brush settings
    if (refHue === undefined) refHue = brushHue;
    if (refChroma === undefined) refChroma = brushChroma;
    if (refLuminance === undefined) refLuminance = brushLuminance;
    if (refSize === undefined) refSize = brushSize;
    if (refVar === undefined) refVar = brushVar;
  } else {
    refX = undefined; // WIP WONT NEED THIS, SEE ABOVE
    refY = undefined;
    refHue = undefined;
    refChroma = undefined;
    refLuminance = undefined;
    refSize = undefined;
    refVar = undefined;
  }

  // DRAWING
  if (inputMode() === "draw") {

    const easedSize = easeInCirc(brushSize, 4, 600);

    if (brushTool === "Stamp Tool" && penDown) {
      drawBrushstroke(bufferGraphics, penX, penY, easedSize, penAngle, penPressure, texture);
    } else if (brushTool === "Fan Line Tool" && penDown) {
      // one color variation for each line instance
      bufferGraphics.stroke(brushHexWithHueVarSeed(penY * penX));
      drawWithLine(bufferGraphics, penStartX, penStartY, penX, penY, easedSize);
    } else if (brushTool === "Line Tool" && wasDown && !penDown) {
      // one color variation for each line instance
      bufferGraphics.stroke(brushHexWithHueVarSeed(penStartX * penStartY));
      drawWithLine(bufferGraphics, penStartX, penStartY, penX, penY, easedSize);
    }

  } else { // MENU OPENED

    const penMode = (!useMouse && penStartX !== undefined && penStartY !== undefined)

    if (inputMode() === "lc") { 
      // Get positions
      let deltaX = penX - (penMode ? penStartX : refX);
      let deltaY = penY - (penMode ? penStartY : refY);
      let rangeX = gadgetRadius * 2;
      let rangeY = gadgetRadius * 2;

      // Map to chroma and luminance
      brushChroma = map(deltaX + rangeX * (refChroma * 2), 0, rangeX, 0, 0.5, true);
      brushLuminance = map(-deltaY + rangeY * refLuminance, 0, rangeY, 0, 1, true);

    } else if (inputMode() === "hue") { // '1', hue and hue variation

      // Compute circle center position from reference
      const startAngle = TWO_PI * (refHue / 360) - HALF_PI;
      const startRadius = gadgetRadius * (1 - refVar / 360);
      const centerX = (penMode ? penStartX : refX) - cos(startAngle) * startRadius;
      const centerY = (penMode ? penStartY : refY) - sin(startAngle) * startRadius;

      // Compute new angle and distance based on that center
      const angle = atan2(penY - centerY, penX - centerX);
      const radius = constrain(dist(penX, penY, centerX, centerY), 0, gadgetRadius);

      brushHue = (degrees(angle) + 90) % 360;
      brushVar = (1 - radius / gadgetRadius) * 360;

      if (brushHue < 0) brushHue += 360;

    } else if (inputMode() === "size") {

      const deltaY = penY - (penMode ? penStartY : refY);
      const rangeY = gadgetRadius * 2;

      brushSize = map(-deltaY + rangeY * map(refSize, 4, 600, 0, 1), 0, rangeY, 4, 600, true);
    }
  }

  // draw the UI to the ui buffer
  updateUI(); 

  // Draw the painting buffer behind the indicator
  image(bufferGraphics, 0, 0);

  // Draw the indicator buffer in the top left corner
  image(uiGraphics, 0, 0);
}

function drawBrushstroke(buffer, x, y, size, angle, pressure, texture) {
  // one color variation for each stamp instance
  const brushHex = brushHexWithHueVarSeed(x + y);
  buffer.fill(brushHex);
  buffer.noStroke();

  drawStamp(buffer, x, y, size, angle, pressure, texture);
}

function drawStamp(buffer, x, y, size, angle, pressure, texture) {
  buffer.push();
  buffer.translate(x, y);
  buffer.rotate(-HALF_PI);

  let stampW = size;
  let stampH = size;

  // brush shape
  if (angle !== undefined) {
    buffer.rotate(angle);
  } else {
    buffer.rotate(HALF_PI);
  }

  if (texture === "Rounded") {

    if (angle !== undefined) {
      stampW = (pressure !== undefined) ? size * map(pressure, 0.0, 0.2, 0.1, 0.9, true) : size * 0.7;
    }
    buffer.rect(- stampW/2, - stampH/2, stampW, stampH, size / 4);

  } else if (texture === "Rake") {

    const circleCount = 4;
    const gapSize = (pressure !== undefined) ? map(pressure, 0.0, 0.2, 3.0, 0.0, true) : 1.0;

    // calculate the actual sizes
    const circleSize = stampH / ((circleCount-1)*gapSize + circleCount);
    buffer.translate(0, -stampH*0.5 + circleSize/2);
    for (let i = 0; i < circleCount; i++) {
      const rakeY = i*(circleSize*(1+gapSize));
      // modify color too
      const brushHex = brushHexWithHueVarSeed(i + Math.round((angle !== undefined) ? angle*6 : 0));
      buffer.fill(brushHex);

      buffer.ellipse(0, rakeY, circleSize);
    }
  }
  

  buffer.pop();
}

function brushHexWithHueVarSeed(seed) {
  return okhex(
    brushLuminance,
    brushChroma,
    brushHue + varStrengths[seed % varStrengths.length] * easedHueVar()
  );
}

function drawWithLine(buffer, xa, ya, xb, yb, size) {

  if (xa === undefined || ya === undefined || xb === undefined || yb === undefined) return;

  // draw the line rect
  buffer.strokeWeight(size);
  buffer.line(xa, ya, xb, yb);

  buffer.strokeWeight(6);
  buffer.noStroke();
}

function updateUI() {
  // Clear the indicator buffer
  uiGraphics.clear();

  // Background borders
  const borderH = height/8;
  const borderW = width/8;
  uiGraphics.fill(okhex(bgLuminance*0.9, bgChroma*0.5, bgHue));
  uiGraphics.rect(0,              0, width, borderH);
  uiGraphics.rect(0, height-borderH, width, borderH);
  uiGraphics.rect(            0, 0, borderW, height);
  uiGraphics.rect(width-borderW, 0, borderW, height);


  
  const easedSize = easeInCirc(brushSize, 4, 600);

  // Unfinished brushstroke preview
  if (brushTool === "Line Tool" && penDown) {
    uiGraphics.stroke(brushHexWithHueVarSeed(penStartX * penStartY));
    drawWithLine(uiGraphics, penStartX, penStartY, penX, penY, easedSize);
  }

  // Corner brush preview
  const visibleTextLum = constrain(bgLuminance + (bgLuminance > 0.5 ? -0.4 : 0.4), 0, 1.0);
  const visHex = okhex(visibleTextLum, min(bgChroma, 0.2), bgHue);
  const brushHex = okhex(brushLuminance, brushChroma, brushHue);
  const refHex = okhex(refLuminance, refChroma, refHue);
  
  const cornerPreviewBrushSize = constrain(easedSize, 8, gadgetRadius/3);
  displayTool(brushTool, texture, 0)
  if (toolMenuOpened) {
    toolPresets.forEach((tool, index) => {
      displayTool(tool.brush, tool.texture, index+1, tool.menuName);
    });
  }

  function displayTool(brushTool, texture, spot, menuName) {

    uiGraphics.push();
    uiGraphics.translate(30, 30 + 60*spot);

    if (brushTool === "Stamp Tool") {
      for (let x = 0; x <= 40; x += 5) {
        drawBrushstroke(uiGraphics, x, 0, cornerPreviewBrushSize, penAngle, penPressure, texture);
      }
    } else if (brushTool === "Line Tool") {
      uiGraphics.stroke(brushHex);
      drawWithLine(uiGraphics, 0, 0, 40, 0, cornerPreviewBrushSize);
    } else {
      //broken color somehow,see the line function
      for (let a = 0; a < 12; a++) {
        uiGraphics.stroke(brushHexWithHueVarSeed(a));
        drawWithLine(uiGraphics, 40-40*(a/12), a*3.5, 0, 0, cornerPreviewBrushSize);
      }
    }

    uiGraphics.pop();

    if (spot > 0) {
      uiGraphics.fill(visHex);
      uiGraphics.textAlign(CENTER, CENTER);
      uiGraphics.text(menuName, 0, 0 + 60*spot, 100, 60);
    }
    uiGraphics.textAlign(LEFT);
  }

  // top left menu
  uiGraphics.stroke(visHex);
  uiGraphics.strokeWeight(1);
  uiGraphics.line(0, 60, 100, 60)
  uiGraphics.noStroke();
  uiGraphics.strokeWeight(6);

  // top left menu text


  uiGraphics.fill(visHex);

  const leftW = 110
  
  if (useMouse) {
    uiGraphics.text("1/2/3: Color/Size •  C:Clear with color", leftW, 30);
    //uiGraphics.text(penDown + "startX " + penStartX + " startY " + penStartY, leftW, 70);
  } else {
    const textureText = (texture !== undefined) ? " (" + texture + " Texture)" : "";
    uiGraphics.text(brushTool + textureText, leftW, 30);
    // uiGraphics.text(wiplog, leftW, 70);
    // uiGraphics.text("Pencil down:" + penDown + " x" + penX + "y" + penY + " fingers:" + fingersDown, leftW, 30);
    // uiGraphics.text("Can decrease:" + fingerState.canDecreaseCount + " Peak:" + fingerState.peakCount, leftW, 70);
    // uiGraphics.text("startX " + penStartX + " startY " + penStartY, leftW, 70);
    // // wip logging text
    // ongoingTouches.forEach((touch, index) => {
    //   if (touch !== undefined) {
    //     uiGraphics.text(
    //       touch.clientX + " " + touch.clientY + 
    //       " force:" + touch.force + 
    //       " id:" + touch.identifier, 
    //       leftW, 90 + index * 20
    //     );
    //     //uiGraphics.text(touch.touchType + " " + touch.azimuthAngle ,leftW, 90 + index * 20);
    //   }
    // });
  }

  // bottom left text
  uiGraphics.text("okLCH: " + brushLuminance.toFixed(3) +
      " • " + brushChroma.toFixed(3) +
      " • " + brushHue.toFixed(1) +
      "     noise: " + map(brushVar, 4, 600, 0, 100).toFixed(1) + "%",
    20, height - 20
  );

  const lessTextLum = constrain(bgLuminance + (bgLuminance > 0.5 ? -0.15 : 0.15), 0, 1.0);
  uiGraphics.fill(okhex(lessTextLum, min(bgChroma, 0.2), bgHue));

  if (refLuminance !== undefined) {
    uiGraphics.text("okLCH: " + refLuminance.toFixed(3) +
        " • " + refChroma.toFixed(3) +
        " • " + refHue.toFixed(1) +
        "     noise: " + map(refVar, 4, 600, 0, 100).toFixed(1) + "%",
      20, height - 40
    );
  }


  // Update the indicator buffer with the current brush color and size
  uiGraphics.noStroke();
  uiGraphics.fill(brushHex);

  // With color menus open, show the current color as a circle made out of arcs showing the hue variation
  function drawEditedColor(size, x, y) {
    uiGraphics.fill(brushHex);
    uiGraphics.ellipse(x, y, size);

    const varSegments = 32;
    for (let i = 0; i < varSegments; i++) {
      const start = (TWO_PI / varSegments) * i;
      const stop = start + TWO_PI / varSegments;
      const varHex = okhex(
        brushLuminance,
        brushChroma,
        brushHue + varStrengths[i] * easedHueVar()
      );
      uiGraphics.fill(varHex);
      uiGraphics.arc(x, y, size, size, start, stop);
    }
  }

  // draw the input menus

  const ankerX = constrain(refX, gadgetRadius*2, width - gadgetRadius*2);
  const ankerY = constrain(refY, gadgetRadius*2, height - gadgetRadius*2);

  if (inputMode() === "hue") {

    // draw hue circle
    const hueLineWidth = 6; // same as stroke width

    // Compute circle center position from reference
    const startAngle = TWO_PI * (brushHue / 360) - HALF_PI;
    const startRadius = constrain(gadgetRadius * (1 - brushVar / 360), 0, gadgetRadius);
    const centerX = ankerX - cos(startAngle) * startRadius;
    const centerY = ankerY - sin(startAngle) * startRadius;

    // Draw center
    uiGraphics.fill(visHex);
    uiGraphics.noStroke();
    uiGraphics.ellipse(centerX, centerY, 20);

    // Draw hue circle around center
    uiGraphics.stroke(brushHex);
    const outerLuminance = (brushLuminance > 0.5) ? brushLuminance - 0.3 : brushLuminance + 0.3;
    drawHueCircle(createVector(centerX, centerY), gadgetRadius+hueLineWidth/2, 36, outerLuminance, 0.4);
    drawHueCircle(createVector(centerX, centerY), gadgetRadius, 36, brushLuminance, brushChroma);
    uiGraphics.noStroke();

    // Show color at reference position
    const currentColorSize = constrain(easeInCirc(brushSize, 4, 600), 8, gadgetRadius/3);
    drawEditedColor(currentColorSize, ankerX, ankerY);
    drawCrosshair(currentColorSize, ankerX, ankerY);

  } else if (inputMode() === "lc") {

    const radius = gadgetRadius;
    const boxBaseX = ankerX + radius;
    const boxBaseY = ankerY + radius;

    const boxAddX = radius * 2 * (brushChroma * 2);
    const boxAddY = radius * 2 * (1 - brushLuminance);

    uiGraphics.push();
    uiGraphics.translate(boxBaseX - boxAddX, boxBaseY - boxAddY);

    // gray left
    let startLCHarr = [1.0, 0.0, brushHue];
    let endLCHarr = [0.0, 0.0, brushHue];
    drawGradientLine(-radius, -radius, -radius, radius, startLCHarr, endLCHarr);
    // top
    uiGraphics.fill("white");
    startLCHarr = [1.0, 0.5, brushHue];
    endLCHarr = [1.0, 0.0, brushHue];
    drawGradientLine(radius, -radius, -radius, -radius, startLCHarr, endLCHarr);
    uiGraphics.noStroke();
    uiGraphics.ellipse(-radius, -radius, 20);
    // colorful right
    uiGraphics.fill(okhex(1, 0.5, brushHue));
    startLCHarr = [0.0, 0.5, brushHue];
    endLCHarr = [1.0, 0.5, brushHue];
    drawGradientLine(radius, radius, radius, -radius, startLCHarr, endLCHarr);
    uiGraphics.noStroke();
    uiGraphics.ellipse(radius, -radius, 20);
    // bottom
    uiGraphics.stroke("black");
    uiGraphics.fill("black");
    uiGraphics.line(-radius, radius, radius, radius);
    uiGraphics.noStroke();
    uiGraphics.ellipse(-radius, radius, 20);
    uiGraphics.fill(okhex(0.0, 0.5, brushHue));
    uiGraphics.ellipse(radius, radius, 20);

    uiGraphics.noStroke();
    uiGraphics.pop();

    // Show color at reference position
    const currentColorSize = constrain(easeInCirc(brushSize, 4, 600), 8, gadgetRadius/3);
    drawEditedColor(currentColorSize, ankerX, ankerY);
    drawCrosshair(currentColorSize, ankerX, ankerY);

  } else if (inputMode() === "size") {

    // scale
    const lineBaseY = ankerY - gadgetRadius;
    const lineAddY = gadgetRadius * 2 * map(brushSize, 4, 600, 0, 1);
    const lineTranslateY = lineBaseY + lineAddY;

    uiGraphics.fill(visHex);
    uiGraphics.ellipse(ankerX, lineTranslateY + gadgetRadius, 10);
    uiGraphics.ellipse(ankerX, lineTranslateY - gadgetRadius, 20);

    uiGraphics.fill(brushHex);
    const easedSize = easeInCirc(brushSize, 4, 600);
    drawStamp(uiGraphics, ankerX, ankerY, easedSize, penAngle, penPressure, texture);
    drawCrosshair(easedSize, ankerX, ankerY);

  } else if (visited && useMouse && !penDown) {

    // draw hover stamp at the pen position
    const easedSize = easeInCirc(brushSize, 4, 600);
    drawStamp(uiGraphics, penX, penY, easedSize, penAngle, penPressure, texture);
  }
}

function drawCrosshair(size, x, y) {
  // draw the crosshair
  uiGraphics.strokeWeight(2);
  const outerLuminance = (brushLuminance > 0.5) ? 0.0 : 1.0;
  uiGraphics.stroke(okhex(outerLuminance, 0.0, 0));

  uiGraphics.line(x, y - size*0.5, x, y - size*0.5 - 6);
  uiGraphics.line(x, y + size*0.5, x, y + size*0.5 + 6);
  uiGraphics.line(x - size*0.5, y, x - size*0.5 - 6, y);
  uiGraphics.line(x + size*0.5, y, x + size*0.5 + 6, y);

  // reset
  uiGraphics.strokeWeight(6);
  uiGraphics.noStroke();
}


function drawGradientLine(xStart, yStart, xEnd, yEnd, startArr, endArr) {
  const segments = 20;
  let lastX = xStart;
  let lastY = yStart;
  for (let i = 1; i < segments + 1; i++) {
    const toX = lerp(xStart, xEnd, i / segments);
    const toY = lerp(yStart, yEnd, i / segments);
    const colorLerpAmt = (i - 0.5) / segments;
    const mixedOkLCH = directMix(startArr, endArr, colorLerpAmt);

    uiGraphics.stroke(mixedOkLCH.hex());
    uiGraphics.line(lastX, lastY, toX, toY);

    lastX = toX;
    lastY = toY;
  }

  function directMix(startArr, endArr, colorLerpAmt) {
    const mixedArr = [
      lerp(startArr[0], endArr[0], colorLerpAmt),
      lerp(startArr[1], endArr[1], colorLerpAmt),
      lerp(startArr[2], endArr[2], colorLerpAmt),
    ];
    return chroma.oklch(mixedArr[0], mixedArr[1], mixedArr[2]);
  }
}

function drawHueCircle(center, radius, numSegments, luminance, chroma) {
  let segmentAngle = TWO_PI / numSegments; // angle of each segment

  for (let i = 0; i < numSegments; i++) {
    let cHue = map(i, 0, numSegments, 0, 360); // map segment index to hue value
    let brushHex = okhex(luminance, chroma, cHue);
    uiGraphics.stroke(brushHex); // set stroke color based on hue
    let startAngle = i * segmentAngle - HALF_PI; // starting angle of segment
    let endAngle = startAngle + segmentAngle; // ending angle of segment
    let start = createVector(
      cos(startAngle) * radius,
      sin(startAngle) * radius
    ); // starting point of segment
    let end = createVector(cos(endAngle) * radius, sin(endAngle) * radius); // ending point of segment
    start.add(center); // add center point to starting point
    end.add(center); // add center point to ending point
    uiGraphics.line(start.x, start.y, end.x, end.y); // draw segment
  }
}

function okhex(l, c, h) {
  return chroma.oklch(l, c, h).hex();
}

function easeInCirc(x, from, to) {
  if (from === undefined) {
    return 1 - Math.sqrt(1 - Math.pow(x, 2));
  }
  return ((1 - Math.sqrt(1 - Math.pow((x - from) / (to - from), 2))) * (to - from) +from);
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

function easedHueVar() {
  // for low chroma, use the no curve amount of hue variation (more intense)
  // for high chroma, use the curve (less intense)
  return lerp(
    brushVar,
    easeInCirc(brushVar, 0, 360),
    easeOutCubic(brushChroma * 2)
  );
}

/*:
 * @plugindesc <AnimatedLoading> for RPG Maker MV version 1.6.2.
 * @author RPG Maker Irina
 *
 * @help
 * *** Introduction ***
 *
 *      The loading image for RPG Maker MV is static, meaning when a game
 * freezes, it's hard to tell if it's still going or not. Having an animated
 * loading image not only tells the player if the game is frozen, it also looks
 * better, and can distract the player from the actual wait time. This plugin
 * lets you make a spritesheet animation to use as your loading image.
 * Instructions will be explained below.
 *
 *
 *
 * *** Instructions ***
 *
 *      Replace your img/system/Loading.png with a sprite sheet format of your
 * new loading image. Download one from the itch.io page here for an example:
 *
 * https://atelieririna.itch.io/animated-loading-image
 *
 *      Then, go into the plugin parameters and adjust the Column and Row
 * parameters to determine how many frames wide and tall the image is. The
 * sprite will then use the frames from left to right, then going down a row
 * once it reaches the furthest right. If you have a 5 wide, 4 tall image, it
 * will go in the following order:
 *
 *  1  2  3  4  5
 *  6  7  8  9 10
 * 11 12 13 14 15
 * 16 17 18 19 20
 *
 *      Once it reaches the end, it will loop back around and start at the
 * very first frame again before continuing forward.
 *
 *
 * *** Plugin Parameters ***
 *
 * X Position, Y Position
 *
 *      The X and Y positions will determine where the loading image appears
 * and is centered upon this exact coordinate. If you use 'auto' without the
 * quotes, the plugin will automatically center it at the middle of the screen.
 *
 * Columns and Rows
 * 
 *      Determine how many columns and rows the loading image sprite sheet is.
 * Look at the instructions section above to see how the frames are utilized
 * and how to set them up for your game.
 *
 * Frame Delay
 * 
 *      This determines how many in-game frames to delay before moving onto the
 * next image frame.
 *
 * Opacity Speed
 *
 *      This is how fast the loading image will fade in or out. Use a number
 * between 1 and 255. 1 will be the slowest. 255 will be the fastest.
 *
 * Force Test
 *
 *      Since some games have relatively fast load times, it's hard to check if
 * your loading image is working properly. Turn this on to test it by forcing
 * the load image to appear in your game. Just remember to turn it off.
 *
 *
 *
 * *** Terms of Use ***
 * 
 * 1. These plugins may be used in free or commercial games.
 * 2. 'RPG Maker Irina' must be given credit in your games.
 * 3. You are allowed to edit the code.
 * 4. Do NOT change the filename, parameters, and information of the plugin.
 * 5. You are NOT allowed to redistribute these Plugins.
 * 6. You may NOT take code for your own released Plugins.
 *
 * *** Help End ***
 *
 * @param 
 *
 * @param posX
 * @text X Position
 * @desc The X position of the center of the image. Use 'auto' if you want to have it automatically positioned at the center.
 * @default auto
 *
 * @param posY
 * @text Y Position
 * @desc The Y position of the center of the image. Use 'auto' if you want to have it automatically positioned at the center.
 * @default auto
 *
 * @param col
 * @text Columns
 * @desc How many columns are there in the image's spritesheet
 * @default 5
 *
 * @param row
 * @text Rows
 * @desc How many rows are there in the image's spritesheet
 * @default 12
 *
 * @param delay
 * @text Frame Delay
 * @desc How many frames to delay the image before going onto the next? Higher numbers are slower with 1 being the fastest.
 * @default 2
 *
 * @param opacitySpeed
 * @text Opacity Speed
 * @desc How fast do you want opacity to fade in and out? 1 for slowest. 255 for fastest.
 * @default 20
 *
 * @param forceTest
 * @text Force Test
 * @type boolean
 * @on Testing
 * @off No Testing
 * @desc Forcefully test the loading image by making it always appear. Used for debugging.
 * @default false
 *
 */
//=============================================================================

var parameters=$plugins.filter(function(a){return a.description.contains("<AnimatedLoading>")})[0].parameters;var Imported=Imported||{};Imported.Irina_AnimatedLoading={posX:String(parameters["posX"]),posY:String(parameters["posY"]),col:Number(parameters["col"]),row:Number(parameters["row"]),delay:Math.max(Number(parameters["delay"]),1),opacitySpeed:Number(parameters["opacitySpeed"]).clamp(1,255),forceTest:eval(parameters["forceTest"]),wait:5};Imported.Irina_AnimatedLoading.Graphics_initialize=Graphics.initialize;Graphics.initialize=function(a,i,e){Imported.Irina_AnimatedLoading.Graphics_initialize.call(this,a,i,e);this._loadFrame=0};Imported.Irina_AnimatedLoading.Graphics_updateLoading=Graphics.updateLoading;Graphics.updateLoading=function(){Imported.Irina_AnimatedLoading.Graphics_updateLoading.call(this);if((this._loadingCount+1)%Imported.Irina_AnimatedLoading.delay===0){this._loadFrame=(this._loadFrame+1)%(Imported.Irina_AnimatedLoading.col*Imported.Irina_AnimatedLoading.row)}};Graphics._paintUpperCanvas=function(){this._clearUpperCanvas();if(this._loadingImage&&this._loadingCount>=Imported.Irina_AnimatedLoading.wait){var a=this._upperCanvas.getContext("2d");var i=Imported.Irina_AnimatedLoading.posX;var e=Imported.Irina_AnimatedLoading.posY;var t=Imported.Irina_AnimatedLoading.col;var r=Imported.Irina_AnimatedLoading.row;var n=this._loadingImage.width/t;var o=this._loadingImage.height/r;var d=(i!=="auto"?Number(i):this._width/2)-n/2;var p=(e!=="auto"?Number(e):this._height/2)-o/2;a.save();a.globalAlpha=((this._loadingCount-20)/30).clamp(0,1);var m=this._loadFrame%t*n;var s=Math.floor(this._loadFrame/t)*o;a.drawImage(this._loadingImage,m,s,n,o,d,p,n,o);a.restore()}};if(Imported.Irina_AnimatedLoading.forceTest){Imported.Irina_AnimatedLoading.Scene_Base_update=Scene_Base.prototype.update;Scene_Base.prototype.update=function(){Imported.Irina_AnimatedLoading.Scene_Base_update.call(this);Graphics.updateLoading()}}
/*:
* @plugindesc Compatibility Fix SRD_CharacterCreatorEx and YEP_GabWindow
* @author Yorae Rasante
* @help
* YEP_GabWindow is on version 1.05
* SRD_CharacterCreatorEx is on version 1.01
*
* Overwritten functions:
* Game_Interpreter.prototype.clearGabInformation
* Game_Interpreter.prototype.showGab
* Game_Interpreter.prototype.forceGab
* Window_Gab.prototype.processNewGabData
*/

if(Imported.YEP_GabWindow && Imported["SumRndmDde Character Creator EX"]) {

  Game_Interpreter.prototype.clearGabInformation = function() {
      this._gabText = '';
      this._gabGraphicType = 'none';
      this._gabGraphicName = '';
      this._gabGraphicIndex = 0;
      this._gabSoundName = '';
      this._gabSwitch = 0;
      this._customFace = undefined;
  };

  var _Game_Interpreter_setGabActorFace = Game_Interpreter.prototype.setGabActorFace;
  Game_Interpreter.prototype.setGabActorFace = function(args) {
      var actorId = parseInt(args[0]);
      var actor = $gameActors.actor(actorId);
      if (!actor) return;
      if(actor.hasSetImage()) {
        this._customFace = actor;
        _Game_Interpreter_setGabActorFace.call(this, args);
      } else _Game_Interpreter_setGabActorFace.call(this, args);
  };

  Game_Interpreter.prototype.showGab = function() {
    if (!this._gabText) return;
      var gabData = [
          this._gabText,
          this._gabGraphicType,
          this._gabGraphicName,
          this._gabGraphicIndex,
          this._gabSoundName,
          this._gabSwitch,
          this._customFace
      ];
      var scene = SceneManager._scene;
      if (scene._gabWindow)  scene.startGabWindow(gabData);
      this.clearGabInformation();
  };

  Game_Interpreter.prototype.forceGab = function() {
      if (!this._gabText) return;
      var gabData = [
          this._gabText,
          this._gabGraphicType,
          this._gabGraphicName,
          this._gabGraphicIndex,
          this._gabSoundName,
          this._gabSwitch,
          this._customFace
      ];
      var scene = SceneManager._scene;
      if (scene._gabWindow) scene.forceGabWindow(gabData);
      this.clearGabInformation();
  };


  Window_Gab.prototype.processNewGabData = function() {
      this._gabRunning = true;
      var gabData = this._gabQueue.shift();
      this._gabSwitchedOn = false;
      this._currentGab = gabData;
      this._text = gabData[0] || '';
      this._graphicType = gabData[1] || 'none';
      this._graphicName = gabData[2] || '';
      this._graphicIndex = gabData[3] || 0;
      this._soundName = gabData[4] || 0;
      this._gabSwitch = gabData[5] || 0;
      this._customFace = gabData[6] || undefined;
      this.setupLoadGraphic();
      this._gabLoaded = true;
  };

  var _Window_Gab_drawGabCharacter = Window_Gab.prototype.drawGabCharacter;
  Window_Gab.prototype.drawGabCharacter = function() {
      if (this._graphicType === 'face') {
        if(this._customFace) {
          var wx = 0;
          var wy = 0;
          var ww = Window_Base._faceWidth;
          var wh = this.lineHeight() * 2;

          this.drawCustomFace(this._customFace, wx, wy, ww, wh);
        } else {
          _Window_Gab_drawGabCharacter.call(this);
        }
      } else {
        _Window_Gab_drawGabCharacter.call(this);
      }
  };


};
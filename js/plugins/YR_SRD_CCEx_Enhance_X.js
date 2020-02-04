 /*:
 * @plugindesc <YR_CCEx_Enhance> to improve SRD's Character Creator EX.
 * @author YoraeRasante
 * 
 * @param saveJSON
 * @text Save new sections
 * @type boolean
 * @on On
 * @off Off
 * @desc Save new sections to JSON on editing settings
 * @default true
 * 
 * @param fpsImprovement
 * @text Improvement of FPS
 * @type boolean
 * @off Off
 * @on On
 * @desc My attempt to improve the FPS of the scene
 * @default true
 * 
 * @param colorReset
 * @text Reset and Save Color
 * @type boolean
 * @off Off
 * @on On
 * @desc Reset the color when changing a piece for the first time and save for when section is reentered
 * @default true
 *
 * @param colorLoop
 * @text Looping Color Selection
 * @type boolean
 * @off Off
 * @on On
 * @desc Allows the color optons to loop.
 * @default true
 * 
 * @param stretchFix
 * @text Stretch Fix
 * @type boolean
 * @off Off
 * @on On
 * @desc Sets the face to be cut when somewhere not square like a normal faces.
 * @default true
 * 
 * @param changeGraphicOptions
 * @text More Change Graphics Options * @type boolean
 * @off Off
 * @on On
 * @desc Adds the options to set custom graphics to events by page and change them by script call.
 * @default true
 * 
 * @param confirmText
 * @text Confirm Text
 * @type text
 * @desc The confirmation text for when exiting the character creator
 * @default Yes!
 * 
 * @param cancelText
 * @text Cancel Text
 * @type text
 * @desc The cancelation text for when not exiting the character creator
 * @default Nope
 * 
 * 
 * @help
 * CCEX Enhancements Expansion
 * SumRndmDde's Character Creator Ex is great... but it is not perfect.
 * There are some things I like and some i dislike.
 * So I created this to change those I dislike, and add the options for
 * others to make the same changes if they so want.
 * 
 * Among the new things, is:
 * 
 * The saving of new sections. Originally new sections needed to be added
 * by hand to the JSON file before options being save-able on SuperTools.
 * Now, just editting them once they'll be saved there.
 * 
 * Changing how the preview is made, making (at least for me) it take less
 * from the computer to work.
 * 
 * Reset color of sections when entered for the first time for a character,
 * something needed to be able to save them for, if re-entered, the menu
 * is already at the right option.
 * 
 * Color selection looping left and right.
 * 
 * There is a fix for the actor's faces be stretched or shrunk instead of
 * being cut like normal ones when called somewhere out of proportions.
 * 
 * It allows to set Custom Character Graphics for events not just on the
 * notebox, but also in a page only through event comments or through a
 * script call.
 *  For changing to an alive custom actor graphic, use the command:
 *      $gameMap.event(id).setCustomCharacter(actorId);
 *  For changing to a dead custom actor graphic, use the command:
 *      $gameMap.event(id).setDeadCustomCharacter(actorId);
 * To stop using a custom actor graphic, use the command:
 *      $gameMap.event(id).removeCustomCharacter();
 * 
 * And there is also the option to change the "Yes/No" in the confirmation.
 * 
 * Changing the Color Selection to change color by clocking on the < and >
 * is not deactivateable.
 * 
*/


//* And to make an enemy use a custom battler, use the notetag:
//*      <CUSTOM CHARACTER : #>
//*          where # is the custom actor's id.


var Imported = Imported || {};
Imported.YR_CCEx_Enhance = true;

var YR = YR || {};
YR.CCEx_Enhance = {};

if (Imported["SumRndmDde Character Creator EX"]) {

var parameters = $plugins.filter(function(p) { return p.description.contains('<YR_CCEx_Enhance>') })[0].parameters;

YR.CCEx_Enhance.autoSaveJSON = eval(parameters['saveJSON']);
YR.CCEx_Enhance.fpsImprovement = eval(parameters['fpsImprovement']);
YR.CCEx_Enhance.colorReset = eval(parameters['colorReset']);
YR.CCEx_Enhance.colorLoop = eval(parameters['colorLoop']);
YR.CCEx_Enhance.changeGraphicOptions = eval(parameters['changeGraphicOptions']);
YR.CCEx_Enhance.stretchFix = String(parameters['stretchFix']);
YR.CCEx_Enhance.confirmText = String(parameters['confirmText']);
YR.CCEx_Enhance.cancelText = String(parameters['cancelText']);

if(YR.CCEx_Enhance.autoSaveJSON) {
    DataManagerEX.saveCurrentCharacterCreator = function() {
        const doc = MakerManager.document;
        const data = $dataCharacterCreator[this._characterCreatorSection];
        if(data) {
            data.label = doc.getElementById('label').value;
            data.source = doc.getElementById('source').value;
            data.direction = parseInt(doc.getElementById('direction').value || '0');
            data.condition = doc.getElementById('condition').value;
            data.colors = JSON.parse('[' + doc.getElementById('colors').value + ']');
            FileManager.saveData($dataCharacterCreator, "CharacterCreator.json");
        } else {
            var newdata = {};
            newdata.label = doc.getElementById('label').value;
            newdata.source = doc.getElementById('source').value;
            newdata.direction = parseInt(doc.getElementById('direction').value || '0');
            newdata.condition = doc.getElementById('condition').value;
            newdata.colors = JSON.parse('[' + doc.getElementById('colors').value + ']');
            $dataCharacterCreator[this._characterCreatorSection] = newdata;
            FileManager.saveData($dataCharacterCreator, "CharacterCreator.json");
        }
    }
};

if(YR.CCEx_Enhance.fpsImprovement) {
    Window_CharacterCreator_Preview.prototype.refresh = function() {
        var index = 0;
        for(let i = 0; i < SRD.CharacterCreatorEX.priorities.length; i++) {
            const section = SRD.CharacterCreatorEX.priorities[i];
            if(this._pieces[section]) {
                const info = this._pieces[section];
                if(!this._spritePieces[section]) {
                    this._spritePieces[section] = new this._formattingClass();
                    this._spriteFilters[section] = new PIXI.filters.ColorMatrixFilter();
                    this._spritePieces[section]._filters = this._spritePieces[section]._filters || [];
                    this._spritePieces[section]._filters.push(this._spriteFilters[section]);
                    if(info.color) {
                        this._spritePieces[section].color = info.color[0];
                        this.setColor(section, info.color);
                    }
                    const bit = SRD.CharacterCreatorEX.loadImageWPath(info.path, info.file, 0, true);
                    this._spritePieces[section].file = String(info.file);
                    bit.addLoadListener(function() {
                        if(this._spritePieces[section]) {
                            this._spritePieces[section].bitmap = bit;
                        }
                    }.bind(this));
                    this._sprite.addChildAt(this._spritePieces[section], index);
                } else {
                    if(info.color[0] !== this._spritePieces[section].color) {
                        this._spritePieces[section].color = info.color;
                        this.setColor(section, info.color);
                    }
                    if (String(info.file) !== this._spritePieces[section].file) {
                        const bit = SRD.CharacterCreatorEX.loadImageWPath(info.path, info.file, 0, true);
                        this._spritePieces[section].file = String(info.file);
                        bit.addLoadListener(function() {
                            if(this._spritePieces[section]) {
                                this._spritePieces[section].bitmap = bit;
                            }
                        }.bind(this));
                    }
                }
                index++;
                this._spritePieces[section].refresh();
            } else {
                if(this._spritePieces[section]) {
                    this._sprite.removeChild(this._spritePieces[section]);
                    this._spritePieces[section] = undefined;
                }    
            }
        }
    };

    Scene_CharacterCreator.prototype.createPreviewFaceWindow = function() {
        this._previewWindowFace = new Window_CharacterCreator_Show(0, 0, SRD.CharacterCreatorEX.faceFileWidth, SRD.CharacterCreatorEX.faceFileHeight, 'face');
        this._previewWindowFace.x = (((Graphics.boxWidth - this._fileList.x - this._fileList.width) - this._previewWindowFace.width) / 2) + this._fileList.width + this._fileList.x + SRD.CharacterCreatorEX.xOffset;
        this._previewWindowFace.y = (Graphics.boxHeight - this._previewWindowFace.height) / 2;
        this.addWindow(this._previewWindowFace);
        if($gameCharacterCreations.hasInfo($gameCharacterCreations._tempActorId, 'face')) {
            this._previewWindowFace.setInfo($gameCharacterCreations.getInfo($gameCharacterCreations._tempActorId, 'face'));
            this._loadedStuff++;
        }
    };

    Scene_CharacterCreator.prototype.createPreviewWindow = function() {
        this._previewWindow = new Window_CharacterCreator_Show(0, 0, SRD.CharacterCreatorEX.width, SRD.CharacterCreatorEX.height, 'char');
        this._previewWindow.x = ((this._previewWindowFace.width - (this._previewWindow.width*2))/2) + this._previewWindowFace.x;
        this._previewWindow.y = this._previewWindowFace.y +  this._previewWindowFace.height;
        this.addWindow(this._previewWindow);
        if($gameCharacterCreations.hasInfo($gameCharacterCreations._tempActorId)) {
            this._previewWindow.setInfo($gameCharacterCreations.getInfo($gameCharacterCreations._tempActorId));
            this._loadedStuff++;
        }
    };

    Scene_CharacterCreator.prototype.createPreviewDeadWindow = function() {
        this._previewWindowDead = new Window_CharacterCreator_Show(0, 0, SRD.CharacterCreatorEX.width, SRD.CharacterCreatorEX.height, 'dead');
        this._previewWindowDead.x = this._previewWindow.x + this._previewWindow.width;
        this._previewWindowDead.y = this._previewWindowFace.y +  this._previewWindowFace.height;
        this.addWindow(this._previewWindowDead);
        if($gameCharacterCreations.hasInfo($gameCharacterCreations._tempActorId, 'dead')) {
            this._previewWindowDead.setInfo($gameCharacterCreations.getInfo($gameCharacterCreations._tempActorId, 'dead'));
            this._loadedStuff++;
        }
    };

    Scene_CharacterCreator.prototype.createPreviewSvWindow = function() {
        this._previewWindowSv = new Window_CharacterCreator_Show(0, 0, SRD.CharacterCreatorEX.svWidth, SRD.CharacterCreatorEX.svHeight, 'sv');
        this._previewWindowSv.x = (((Graphics.boxWidth - this._fileList.x - this._fileList.width) - this._previewWindowSv.width) / 2) + this._fileList.width + this._fileList.x + SRD.CharacterCreatorEX.xOffset;
        this._previewWindowSv.y = this._previewWindowDead.y +  this._previewWindowDead.height;
        this.addWindow(this._previewWindowSv);
        if($gameCharacterCreations.hasInfo($gameCharacterCreations._tempActorId, 'sv')) {
            this._previewWindowSv.setInfo($gameCharacterCreations.getInfo($gameCharacterCreations._tempActorId, 'sv'));
            this._loadedStuff++;
        }
    };

    function Window_CharacterCreator_Show() {
        this.initialize.apply(this, arguments);
    }

    Window_CharacterCreator_Show.prototype = Object.create(Window_Base.prototype);
    Window_CharacterCreator_Show.prototype.constructor = Window_CharacterCreator_Show;

    Window_CharacterCreator_Show.prototype.initialize = function(x, y, width, height, type) {
        Window_Base.prototype.initialize.call(this, x, y, 
            width + (this.standardPadding() * 2), height + (this.standardPadding() * 2));
        this._spritePieces = {};
        this._spriteFilters = {};
        this._pieces = {};
        this._formattingClass;
        if(!type) {
            this._type = '';
        } else if(type === 'char') {
            this._type = 'char';
            this._stepCounter = 1;
            this._stepDirection = 1;
            this._directionCounter = 0;
            this._directions = [0, 1, 3, 2];
            this._timingCounter = 0;
        } else if(type === 'dead') {
            this._type = 'dead';
        } else if(type === 'sv') {
            this._type = 'sv';
            this._stepCounter = 0;
            this._stepDirection = 1;
            this._currentRow = 0;
            this._currentColumn = 0;
            this._timingCounter = 0;
        } else {
            this._type = '';
        }
        this._sprite = new Sprite();
        this._sprite.x = this.standardPadding();
        this._sprite.y = this.standardPadding();
        this.addChild(this._sprite);
    };

    Window_CharacterCreator_Show.prototype.info = Window_CharacterCreator_Preview.prototype.info;

    Window_CharacterCreator_Show.prototype.setInfo = function(info) {
        this._change = true;
        Window_CharacterCreator_Preview.prototype.setInfo.call(this, info);
    };

    Window_CharacterCreator_Show.prototype.addImage = function (imagePath, section, file) {
        this._change = true;
        Window_CharacterCreator_Preview.prototype.addImage.call(this, imagePath, section, file)
    };

    Window_CharacterCreator_Show.prototype.setColor = function(section, hsl) {
        this._change = true;
        if (this._pieces[section]) this._pieces[section].color = JsonEx.makeDeepCopy(hsl);
        this.refresh();
    };

    Window_CharacterCreator_Show.prototype.refresh = function() {
        if (this._change) {
            if(this._type === 'char') {
                this._image = $gameCharacterCreations.buildBitmap(0, this.info());
            } else if(this._type === 'dead') {
                this._image = $gameCharacterCreations.buildBitmapDead(0, this.info());
            } else if(this._type === '') {
                this._image = $gameCharacterCreations.buildBitmapFace(0, this.info());
            } else if(this._type === 'sv') {
                this._image = $gameCharacterCreations.buildBitmapSv(0, this.info());
            }
            this._sprite.bitmap = this._image;
            if(this._type === 'dead') {
                this._sprite.setFrame(0, 0, SRD.CharacterCreatorEX.width, SRD.CharacterCreatorEX.height);
            }
            this._change = undefined;
        }

        if(this._type === 'char') {
            this._timingCounter++;
            if(this._timingCounter % 10 === 0) {
                this._stepCounter += this._stepDirection;
                if(this._stepCounter === 2 || this._stepCounter === 0) this._stepDirection *= (-1);
                if(this._timingCounter % 120 === 0) {
                    this._directionCounter++;
                    if(this._directionCounter > 3) {
                        this._directionCounter = 0;
                        this._timingCounter = 0;
                    }
                }
            }
            this._sprite.setFrame(SRD.CharacterCreatorEX.width * this._stepCounter, SRD.CharacterCreatorEX.height * this._directions[this._directionCounter],
                SRD.CharacterCreatorEX.width, SRD.CharacterCreatorEX.height);
        } else if(this._type === 'sv') {
            this._timingCounter++;
            if(this._timingCounter % 10 === 0) {
                this._stepCounter += this._stepDirection;
                if(this._stepCounter === 2 || this._stepCounter === 0) this._stepDirection *= (-1);
                if(this._timingCounter % 120 === 0) {
                    this._currentRow++;
                    if(this._currentRow > 5) {
                        this._currentRow = 0;
                        this._currentColumn++;
                        if(this._currentColumn > 2) {
                            this._currentColumn = 0;
                            this._timingCounter = 0;
                        }
                    }
                }
            }
            this._sprite.setFrame((SRD.CharacterCreatorEX.svWidth * this._stepCounter) + (SRD.CharacterCreatorEX.svWidth * 3 * this._currentColumn),
                SRD.CharacterCreatorEX.svHeight * this._currentRow,
                SRD.CharacterCreatorEX.svWidth, SRD.CharacterCreatorEX.svHeight);
        }
    };

    YR.CCEx_Enhance.SCC_update = Scene_CharacterCreator.prototype.update
    Scene_CharacterCreator.prototype.update = function() {
        YR.CCEx_Enhance.SCC_update.call(this);
        if (this._previewWindow) this._previewWindow.refresh();
        if (this._previewWindowSv) this._previewWindowSv.refresh();
    };
};

if (YR.CCEx_Enhance.colorReset) {
    YR.CCEx_Enhance.SCC_shiftCurrentSelection = Scene_CharacterCreator.prototype.shiftCurrentSelection;
    Scene_CharacterCreator.prototype.shiftCurrentSelection = function(index) {
        YR.CCEx_Enhance.SCC_shiftCurrentSelection.call(this, index);
        if($dataCharacterCreator[this._fileList.currentSectionNoPart()]) {
            $gameSystem.characterCreatorColorIndex[$gameCharacterCreations._tempActorId][this._fileList.currentSectionNoPart()] = index;
        }
    };

    YR.CCEx_Enhance.WHS_open = Window_HueSelector.prototype.open;
    Window_HueSelector.prototype.open = function(section) {
        YR.CCEx_Enhance.WHS_open.call(this, section);
        const index = $gameSystem.colorIndexSaves()[section] || 0;
        if (index === 0) this.refreshEveything();
    };
};

if (YR.CCEx_Enhance.colorLoop) {
    Window_HueSelector.prototype.cursorRight = function(wrap) {
        if(this._colorIndex < this._colors.length - 1) {
            this._colorIndex++;
        } else {
            this._colorIndex = 0;
        }
        this.refreshEveything();
        SoundManager.playCursor();
    };

    Window_HueSelector.prototype.cursorLeft = function(wrap) {
        if(this._colorIndex > 0) {
            this._colorIndex--;
        } else {
            this._colorIndex = this._colors.length - 1;
        }
        this.refreshEveything();
        SoundManager.playCursor();
    };
};

if (YR.CCEx_Enhance.stretchFix) {
    Window_Base.prototype.drawFaceFromBitmap = function(bitmap, x, y, w, h) {
        var pw = Window_Base._faceWidth;
        var ph = Window_Base._faceHeight;
        w = w || pw;
        h = h || ph;
        var width = Math.min(w, pw);
        var height = Math.min(h, ph);
        var dx = Math.floor(x + Math.max(w - pw, 0) / 2);
        var dy = Math.floor(y + Math.max(h - ph, 0) / 2);
        if(!bitmap) {
            bitmap = _.loadImage('CustomFace', 0);
        }
        this.contents.blt(bitmap, 0, 0, width, height, dx, dy);
    };
    
    Window_Base.prototype.drawCustomFace = function(actor, x, y, w, h) {
        var pw = Window_Base._faceWidth;
        var ph = Window_Base._faceHeight;
        w = w || pw;
        h = h || ph;
        var width = Math.min(w, pw);
        var height = Math.min(h, ph);
        var dx = Math.floor(x + Math.max(w - pw, 0) / 2);
        var dy = Math.floor(y + Math.max(h - ph, 0) / 2);
        var sx = (pw - width) / 2;
        var sy = (ph - height) / 2;
    
         const bitmap = this.getCustomFace(actor);
        this.contents.blt(bitmap, sx, sy, width, height, dx, dy);
    };
    
    if(Imported.YEP_BattleStatusWindow) {
        Window_BattleStatus.prototype.drawCustomFace = function(actor, x, y, w, h) {
            var pw = Window_Base._faceWidth;
            var ph = Window_Base._faceHeight;
            w = w || pw;
            h = h || ph;
            var width = Math.min(w, pw);
            var height = Math.min(h, ph);
            var dx = Math.floor(x + Math.max(w - pw, 0) / 2);
            var dy = Math.floor(y + Math.max(h - ph, 0) / 2);
             const bitmap = this.getCustomFace(actor);
            this._faceContents.bitmap.blt(bitmap, 0, 0, width, height, dx, dy);
        };
    }
}

if (YR.CCEx_Enhance.changeGraphicOptions) {
    Game_Event.prototype.initialize = function(mapId, eventId) {
        return SRD.CharacterCreatorEX.Game_Event_initialize.apply(this, arguments);
    };

    YR.CCEx_Enhance.GE_setupPageSettings = Game_Event.prototype.setupPageSettings;
    Game_Event.prototype.setupPageSettings = function() {
        YR.CCEx_Enhance.GE_setupPageSettings.call(this);
        this.setupCustomCharacter();
    };

    YR.CCEx_Enhance.GE_setupCustomCharacter = Game_Event.prototype.setupCustomCharacter;
    Game_Event.prototype.setupCustomCharacter = function() {
        this._customCharacterId = undefined;
        this._customCharacterActor = undefined;
        this._isCustomDeadCharacter = false;
        this._needsCustomCharacterUpdate = false;
        var comments = this.page().list.filter(function(list) {
            return list.code === 108 || list.code === 408;
        });
        comments = comments.map(function(list) {
            return list.parameters;
        });
        var note = comments.toString();
        if(note.match(/<Custom[ ]?Character[ ]?:\s*(\d+)\s*>/im)) {
            this._customCharacterId = parseInt(RegExp.$1);
            this._customCharacterActor = $gameActors.actor(this._customCharacterId);
            this._needsCustomCharacterUpdate = true;
        }else if(note.match(/<Custom[ ]?Dead[ ]?Character[ ]?:\s*(\d+)\s*>/im)) {
            this._customCharacterId = parseInt(RegExp.$1);
            this._customCharacterActor = $gameActors.actor(this._customCharacterId);
            this._isCustomDeadCharacter = true;
            this._needsCustomCharacterUpdate = true;
        }
        if (!this._customCharacterId) YR.CCEx_Enhance.GE_setupCustomCharacter.call(this);
    };

    Game_Event.prototype.setCustomCharacter = function(actorId) {
        if(!this._customCharacterId || this._customCharacterId !== actorId) {
            this._customCharacterId = actorId;
            this._customCharacterActor = $gameActors.actor(this._customCharacterId);
        }
        this._isCustomDeadCharacter = false;
        this._needsCustomCharacterUpdate = true;
    }

    Game_Event.prototype.setDeadCustomCharacter = function(actorId) {
        if(!this._customCharacterId || this._customCharacterId !== actorId) {
            this._customCharacterId = actorId;
            this._customCharacterActor = $gameActors.actor(this._customCharacterId);
        }
        this._isCustomDeadCharacter = true;
        this._needsCustomCharacterUpdate = true;
    }

    Game_Event.prototype.removeCustomCharacter = function() {
        this._customCharacterId = undefined;
        this._customCharacterActor = undefined;
        this._isCustomDeadCharacter = false;
        this._needsCustomCharacterUpdate = true;
    }

    /*
    if (Imported.YEP_X_AnimatedSVEnemies) {
        YR.CCEx_Enhance.aSvENotetag = /<(?:CUSTOM[ ]*CHARACTER[ ]*:[ ]*)(\d+)>/i;

        YR.CCEx_Enhance.DM_processSVENotetags1 = DataManager.processSVENotetags1;
        DataManager.processSVENotetags1 = function(group) {
            YR.CCEx_Enhance.DM_processSVENotetags1.call(this, group);
            for (var n = 1; n < group.length; n++) {
                var obj = group[n];
                var notedata = obj.note.split(/[\r\n]+/);

                obj._customCharacterId = 0;

                for (var i = 0; i < notedata.length; i++) {
                    var line = notedata[i];
                    if (line.match(YR.CCEx_Enhance.aSvENotetag)) obj._customCharacterId = Number(RegExp.$1);
                }
            }
        }

        YR.CCEx_Enhance.GE_isBreathing = Game_Enemy.prototype.isBreathing;
        Game_Enemy.prototype.isBreathing = function() {
            if (this.isDead()) return false;
            if (this.battler().hasSetImage()) return [2, 3].contains(Yanfly.Param.SVEBreathing);
            else return YR.CCEx_Enhance.GE_isBreathing.call(this);
        };

        YR.CCEx_Enhance.GE_spriteScaleX = Game_Enemy.prototype.spriteScaleX;
        Game_Enemy.prototype.spriteScaleX = function() {
            if (this.battler().hasSetImage()) return this.enemy().spriteScaleX * -1;
            return YR.CCEx_Enhance.GE_spriteScaleX.call(this);
        };

        YR.CCEx_Enhance.SE_initSVSprites = Sprite_Enemy.prototype.initSVSprites;
        Sprite_Enemy.prototype.initSVSprites = function() {
            YR.CCEx_Enhance.SE_initSVSprites.call(this);
            this._customCharacterId = 0;
            this._customCharacterActor = undefined;
        };

        Sprite_Enemy.prototype.hasSetImage = function() {
            return !!this._customCharacterId && this._customCharacterActor.hasSetImage();
        };

        YR.CCEx_Enhance.SE_setSVBattler = Sprite_Enemy.prototype.setSVBattler;
        Sprite_Enemy.prototype.setSVBattler = function(battler) {
            YR.CCEx_Enhance.SE_setSVBattler.call(this, battler);
            this.updateSVBitmap();
        };

        YR.CCEx_Enhance.SE_updateSVBitmap = Sprite_Enemy.prototype.updateSVBitmap;
        Sprite_Enemy.prototype.updateSVBitmap = function() {
            if (this._customCharacterId !== this._enemy.enemy()._customCharacterId) var changed = true;
            if (changed) {            
                this._customCharacterId = this._enemy.enemy()._customCharacterId;
                this._customCharacterActor = $gameActors.actor(this._customCharacterId);
                if (this.hasSetImage()) {
                    Sprite_Battler.prototype.updateBitmap.call(this);
                    this._createdDummyMainSprite = false;
                    this._svBattlerName = '';
                    this._mainSprite._bitmap = this._customCharacterActor.getCreatorBitmap();
                    if(!this._svBattlerEnabled) this.scale.x *= -1;
                    this._svBattlerEnabled = true;
                    this.adjustAnchor();
                    this.refreshMotion();
                    this.updateScale();
                } else {
                    YR.CCEx_Enhance.SE_updateSVBitmap.call(this);
                }
            }
        };
    }*/
};

Window_CharacterCreatorConfirmation.prototype.makeCommandList = function() {
	this.addCommand(YR.CCEx_Enhance.confirmText,   'yes');
	this.addCommand(YR.CCEx_Enhance.cancelText,   'no');
};

Window_HueSelector.prototype.onTouch = function(triggered) {
    var x = this.canvasToLocalX(TouchInput.x);
    var y = this.canvasToLocalY(TouchInput.y);
    var leftWidth = this.textWidth('<  ') + this.standardPadding();
    var rightWidth = this.textWidth('  >') + this.standardPadding();
    console.log(leftWidth, x, this.width - rightWidth)
    if (x >= leftWidth) {
        if (x < this.width - rightWidth) {
            if (triggered && this.isTouchOkEnabled()) {
                this.processOk();
            }
        } else {
            if (triggered || this._stayCount >= 10) {
                this.cursorRight();
            this._stayCount = 0;
            }
        }
    } else {
        if (triggered || this._stayCount >= 10) {
            this.cursorLeft();
        this._stayCount = 0;
        }
    }
};

} else {
    alert("YR_SRD_CCEx_Enhance_X is an expansion for the 'SRD_CharacterCreatorEX' plugin. As such, it is useless without it.");
};
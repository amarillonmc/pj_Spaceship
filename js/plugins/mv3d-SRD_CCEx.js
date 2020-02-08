if (Imported && Imported["SumRndmDde Character Creator EX"]) {
    var updateCharacter = function(){
        //main edit starts here
        if (this._character.hasSetImage() &&
        (!this._character._oldCustomBitmap || this._character._oldCustomBitmap !== this._character._customBitmap)) {
            if (!this._character._customBitmap) this._character.needsCustomUpdate();
            this.setMaterial(this._character._customBitmap);
            this._character._oldCustomBitmap = this._character._customBitmap;
            this._isBigCharacter = true;
            this._character._charNeedsUpdate = false;
		} else if (SRD.CharacterCreatorEX.Sprite_Character_isImageChanged.call(this) || !!this._character._customBitmap) {
            this._character._oldCustomBitmap = undefined;
            this._character._customBitmap = undefined;
            //main edit ends here
            this._tilesetId = $gameMap.tilesetId();
            this._tileId = this._character.tileId();
            this._characterName = this._character.characterName();
            this._characterIndex = this._character.characterIndex();
            this._isBigCharacter = ImageManager.isBigCharacter(this._characterName);
            if(this._tileId>0){
                this.setTileMaterial(this._tileId);
            }else if(this._characterName){
                this.setMaterial(`img/characters/${this._characterName}.png`);
            }else{
                this.setEnabled(false);
                this.spriteWidth=1;
                this.spriteHeight=0;
            }
        }
        //well, technically edit ends here, but it is just closing the block of the else created for the original code
	}

    //The way mv3d is made is not possible to just alias the Character class, this makes the changes as they are created
    var mv3d_CCEx_createCharacterFor = mv3d.createCharacterFor;
    mv3d.createCharacterFor = function () {
        var char = mv3d_CCEx_createCharacterFor.apply(this, arguments);
        char.updateCharacter = updateCharacter;
        char.updateCharacter();
        return char;
    } 

    //These are copied because in CCEx they are inside an IIFE, locking them from aliasing
    Game_Actor.prototype.getCreatorBitmapChar = function() {
        if (!this._customBitmap_Bitmap || this._neededCustomUpdate) {
            this._customBitmap_Bitmap = $gameCharacterCreations.buildBitmap(this.actorId());
            if (this._customBitmap_Bitmap) this._customBitmap = this._customBitmap_Bitmap.canvas.toDataURL();
        }
        var result = this._customBitmap_Bitmap;
        return result;
    };
    Game_Actor.prototype.getCreatorBitmapDead = function() {
        if (!this._customBitmapDead_Bitmap || this._neededCustomUpdate) {
            this._customBitmapDead_Bitmap = $gameCharacterCreations.buildBitmapDead(this.actorId());
            if (this._customBitmapDead_Bitmap) this._customBitmapDead = this._customBitmapDead_Bitmap.canvas.toDataURL();
        }
        var result = this._customBitmapDead_Bitmap;
        return result;
    };
    Game_Event.prototype.needsCustomUpdate = function() {
        if (!!this._customCharacterActor && this._customCharacterActor.hasSetImage() && (this._customCharacterActor._neededCustomUpdate || this._customBitmap !== this.isDeadCustomCharacter() ? this._customCharacterActor._customBitmapDead : this._customCharacterActor._customBitmap)) {
            this._customBitmap = this.isDeadCustomCharacter() ? this._customCharacterActor._customBitmapDead : this._customCharacterActor._customBitmap;
        }
        return !!this._needsCustomCharacterUpdate ||
        !!(this._customCharacterActor && (this._customCharacterActor._neededCustomUpdate ||
            (this._oldCustomBitmap !== this._customBitmap)));
    };
    Game_Player.prototype.needsCustomUpdate = function() {
        const actor = $gameParty.leader();
        if (!actor) return false;
        if (actor.hasSetImage() && (actor._neededCustomUpdate || this._customBitmap !== this.isDeadCustomCharacter() ? actor._customBitmapDead : actor._customBitmap)) {
            this._customBitmap = this.isDeadCustomCharacter() ? actor._customBitmapDead : actor._customBitmap;
        }
        return !!(actor._neededCustomUpdate || (this._oldCustomBitmap !== this._customBitmap));
    };
    Game_Follower.prototype.needsCustomUpdate = function() {
        const actor = this.actor();
        if (!actor) return false;
        if (actor.hasSetImage() && (actor._neededCustomUpdate || this._customBitmap !== this.isDeadCustomCharacter() ? actor._customBitmapDead : actor._customBitmap)) {
            this._customBitmap = this.isDeadCustomCharacter() ? actor._customBitmapDead : actor._customBitmap;
        }
        return !!(actor._neededCustomUpdate || (this._oldCustomBitmap !== this._customBitmap));
    };
    Game_Player.prototype.setAllNeedsCustomUpdate = function() {
        /*this.setNeedsCustomUpdate(true);
        this._followers.forEach(function(follower) {
            follower.setNeedsCustomUpdate(true);
        }, true);*/
        $gameActors.actor($gameCharacterCreations._tempActorId)._neededCustomUpdate = true;
        $gameActors.actor($gameCharacterCreations._tempActorId).getCreatorBitmapChar();
        $gameActors.actor($gameCharacterCreations._tempActorId).getCreatorBitmapDead();
    };
}
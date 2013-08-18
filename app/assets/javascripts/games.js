// Place all the behaviors and hooks related to the matching controller here.
// All this logic will automatically be available in application.js.
var Game = (function(){
  gameData = "";
  player = "";


  var allDisplay = function(){
    phaseDisplay();
    tankDisplay();
    playerBoxDisplay();
    deckDisplay();
    discardDisplay();
    handDisplay();
    chatDisplay();
  }

  var phaseDisplay = function(){
    var phaseTemplate = JST["templates/phase"]({
      phase: gameData.phase,
      ready: player.ready
    });
    $("div.phase").html(phaseTemplate);
  };

  var tankDisplay = function(){
    var tankTemplate = JST["templates/tank"]({
      players: gameData.players,
      phase: gameData.phase
    });
    $("ul.spaces").html(tankTemplate);
  };

  var playerBoxDisplay = function(){
    $("figure.player-box").each(renderTokens)
    $("figure.player-box").each(renderInfo)
  };

  var renderTokens = function(i, box){
    var color = $(box).hasClass("white") ? "white" : "black";
    var player = gameData.players[i];
    var damageTemplate = JST["templates/damage_tokens"]({
      color: color,
      phase: gameData.phase,
      damageTokens: player.damage_tokens
    });

    $(box).find("ul.tokens").html(damageTemplate)
    if($(".tokens").children().length > 5) {
      $(".tokens").children().addClass("accordion");
    }
  };

  var renderInfo = function(i, box){
    var color = $(box).hasClass("white") ? "white" : "black";
    var player = gameData.players[i];
    var infoTemplate = JST["templates/player_info"]({
      color: color,
      hand: player.outward_hand,
      tokens: player.damage_tokens,
      avatarUrl: player.user.avatar_url,
      username: player.user.username,
      phase: gameData.phase,
      damage: player.damage
    });

    $(box).find("ul.info").html(infoTemplate);
  };

  var deckDisplay = function(){
    var deckTemplate = JST["templates/deck"]({ deck: gameData.deck });
    $("div.deck").html(deckTemplate);
  };

  var discardDisplay = function(){
    var discardTemplate = JST["templates/discard"]({ discard: gameData.discard });
    $("div.discard").html(discardTemplate);
  };

  var handDisplay = function(){
    var hand = player.inward_hand;
    var handTemplate = JST["templates/hand"]({ hand: hand });
    $("ul.hand").html(handTemplate);
  };

  var chatDisplay = function(){
    var chatTemplate = JST["templates/chat"]({
      comments: gameData.comments
    });
    $("ul.chat").html(chatTemplate);
    $(".chat").scrollTop($(".chat")[0].scrollHeight);
  };

  var resultsDisplay = function(){
    var resultsTemplate = JST["templates/game_over"]({
      result: gameData.result,
      winnerName: gameData.winner.username,
      loserName: gameData.loser.username
    });

    $("section.game-over strong").html(resultsTemplate);
  };

  var bindCards = function(zone, index){
    $(".hand .card").on("click", function(){

      if ($(this).hasClass('noclick')) {
        $(this).removeClass('noclick');
      } else {
        $(this).toggleClass("shot-down");
      }
    });
    $(zone + " .card").slice(index).addClass("phased")
    $(zone + " .card").slice(index).draggable({
      snap: ".slot",
      snapMode: "inner",
      cursor: "move",
      revert: "invalid",
      stack: ".card",
      start: function(event, ui){$(this).addClass('noclick');}
    });

    $(".card").data({
      'originalLeft': $(".card").css('left'),
      'originalTop': $(".card").css('top')
    });
  };

  var resetCards = function(){
    $(".card").css({
      "-webkit-transition-property": "-webkit-transform, top, left",
      'left': $(".card").data('originalLeft'),
      'top': $(".card").data('originalTop')
    });

    $("button.flow").attr("disabled", "disabled");

    setTimeout(function(){
      $(".card").css({"-webkit-transition-property": "-webkit-transform"})
    }, 250);
  };

  var dropify = function($el, dropHandler, outHandler) {
    $el.addClass("phased slot");
    $el.droppable({
      drop: dropHandler,
      out: outHandler
    });
  };

  var clearBindings = function(){
    $(".ui-droppable").removeClass("phased slot").droppable("destroy");
    $(".ui-draggable").draggable("destroy");
    $(".moved-count").html("");
    $("button.flow").off("click").attr("disabled", "disabled");
    if ($(".move").hasClass("not-chosen")){
      $(".move").siblings().addBack().toggleClass("chosen not-chosen");
    }
    $("figure.active nav").addClass("hidden");
    $("figure.active nav button").removeClass("up down").off("click");
    $(".warning").addClass("hidden");
  };

  var chatBind = function(){
    $(".add-comment").on("submit", enterComment)
    $(".add-comment textarea").on("keydown", function(event){
      if (event.which == 13) {
        $(this).submit();
      }
    });
  };

  var enterComment = function(){
    event.preventDefault();
    var body = $("#comment_body").val();
    $.ajax({
      url: window.commentUrl,
      dataType: 'json',
      type: "POST",
      data: {
        comment: {
          parent_id: "",
          body: body
        },
      },
      success: function(){
        $("#comment_body").val('')
        $.ajax({
          url: window.gameUrl,
          dataType:'json',
          type: "GET",
          success: function(returnData){
            clearBindings();
            refresh(returnData);
          }
        });
      }
    });
  };

  var destroyIfGone = function(){
    var opponent = gameData.players[(playerColor == "black") ? 0 : 1]
    $(window).on("unload", function(){

      if (opponent && opponent.absent) {
        $.ajax({
          async : false,
          url: window.gameUrl,
          dataType: "json",
          type: "DELETE"
        });
      } else {
        $.ajax({
          async : false,
          url: window.gameUrl,
          type: "PUT",
          data: {"absent": true}
        });
      }
    })
  };

  var init = function(gameData){
    chatBind();
    refresh(gameData);
    //destroyIfGone();
  };

  var refresh = function(returnData) {
    gameData = returnData;
    player = gameData.players[(playerColor == "white") ? 0 : 1]
    allDisplay();
    if (player.ready) {
      setRefreshTimer();
    } else {
      switch(gameData.phase) {
      case "draw":
        renderDraw();
        break;
      case "play":
        renderPlay();
        break;
      case "discard":
        renderDiscard();
        break;
      case "game_over":
        renderOver();
      };
    }
  };

  var setRefreshTimer = function() {
    setTimeout(function(){
      $.ajax({
        url: window.gameUrl,
        dataType:'json',
        type: "GET",
        success: function(returnData){
          refresh(returnData);
        }
      });
    }, 2000);
  };

  var renderDraw = function() {
    var drawnCards = 0;
    var overheating = false;
    bindCards(".deck", -3);

    $(".undo").on("click", function(){
      resetCards();
      drawnCards = 0;
      overheating = false;
      $(".moved-count").html("Drawn cards: " + drawnCards);
    });

    $(".moved-count").html("Drawn cards: 0");

    var drawWarning = function(){
      var $one = $("#" + playerColor + "-1"),
          $two = $("#" + playerColor + "-2");
      switch(drawnCards) {
      case 1:
        $(".warning").addClass("hidden");
        break;
      case 2:
        if ($one.find("img").length) {
          $(".warning").removeClass("hidden");
          overheating = {fake: false};

          if ($one.find("img").css("opacity") == "0.5") {
            $(".warning").addClass("fake");
            overheating = {fake: true};
          }
        } else {
          $(".warning").addClass("hidden");
          overheating = false;
        }
        break;
      case 3:
        if ($one.find("img").length || $two.find("img").length) {
          $(".warning").removeClass("hidden");

          if (($one.find("img").length == 0 ||
               $one.find("img").css("opacity") == "0.5") &&
              ($two.find("img").length == 0 ||
               $two.find("img").css("opacity") == "0.5")){
            $(".warning").addClass("fake");
            overheating = {fake: true};
          } else {
            $(".warning").removeClass("fake");
            overheating = {fake: false};
          }
        }
      };
    };

    var handIn = function(event, ui) {
      $(ui.draggable).offset({top: $(this).offset().top});
      if ($(ui.draggable).hasClass("from-deck")){
        drawnCards += 1;
        $(".moved-count").html("Drawn cards: " + drawnCards);
        if (drawnCards === 1) {
          $("button.flow").removeAttr("disabled");
        } else {
          drawWarning();
        }

        $(ui.draggable).removeClass("from-deck");
      }
    };

    var handOut = function(event, ui) {
      $(ui.draggable).addClass("from-hand");
    };

    var deckIn = function(event, ui) {
      $(ui.draggable).offset($(this).offset());

      if ($(ui.draggable).hasClass("from-hand")){
        drawnCards -= 1;
        $(".moved-count").html("Drawn cards: " + drawnCards);
        if (drawnCards === 0) {
          $("button.flow").attr("disabled", "disabled");
        } else {
          drawWarning()
        }
        $(ui.draggable).removeClass("from-hand");
      }
    };

    var deckOut = function(event, ui) {
      $(ui.draggable).addClass("from-deck");
    };

    dropify($(".hand"), handIn, handOut);
    dropify($(".deck"), deckIn, deckOut);

    $(".confirm").on("click", function(){
      $.ajax({
        url: window.gameUrl,
        type: "PUT",
        data: {
          "phase": "draw",
          "drawn_cards": drawnCards,
          "overheating": overheating
        },
        success: function(returnData){
          clearBindings();
          refresh(returnData);
        }
      });
    });
  };

  var renderPlay = function() {
    bindCards(".hand", 0);

    $(".undo").on("click", function(){
      resetCards();
      play1Out();
      play2Out();
    })

    var addMoveFeint = function(target, ui) {
      $(target + " nav").removeClass("hidden");
      $(target + " button").on("click", {card: ui.draggable}, swapActive);

      if (ui.draggable.attr("data-info").slice(2) == "forward"){
        $(target + " .move").addClass("up");
      } else {
        $(target + " .move").addClass("down");
      }
    };

    var swapActive = function(event) {
      if ($(event.target).hasClass("not-chosen")){
        $(event.target).siblings().addBack().toggleClass("chosen not-chosen");

        if ($(event.target).hasClass("feint")){
          event.data.card.addClass("feint");
        } else {
          event.data.card.removeClass("feint");
        }
      }
    };

    var play1In = function(event, ui) {
      if ($(ui.draggable).hasClass("from-hand")){
        $(ui.draggable).offset($(this).offset());
        dropify($("#play-2"), play2In, play2Out);
        $("button.flow").removeAttr("disabled");
        ui.draggable.addClass("played");
        if (ui.draggable.hasClass("shot-down")){
          addMoveFeint("#active-1", ui);
        }
        $(ui.draggable).removeClass("from-hand");
      }
    };

    var play1Out = function(event, ui) {
      if (!($(ui.draggable).hasClass("from-hand"))){
        $(ui.draggable).addClass("from-active")
        $("button.flow").attr("disabled", "disabled");
        $("#active-1 nav").addClass("hidden");

        if ($("#active-1 .move").hasClass("not-chosen")){
          $("#active-1 .move").click();
        }
        $("#active-1 button").off("click");
        $(".played").removeClass("played");

        if ($("#play-2").hasClass("ui-droppable")){
          $("#play-2").removeClass("phased slot");
          $("#play-2").droppable('destroy');
          play2Out(event, ui);
        }
      }
    };

    var play2In = function(event, ui) {
      if ($(ui.draggable).hasClass("from-hand")){
        $(ui.draggable).offset($(this).offset());
        $(".warning").removeClass("hidden");
        ui.draggable.addClass("played");

        if (ui.draggable.hasClass("shot-down")){
          addMoveFeint("#active-2", ui);
        }
        $(ui.draggable).removeClass("from-hand");
      }
    };

    var play2Out = function(event, ui) {
      $(ui.draggable).addClass("from-active")
      $(".warning").addClass("hidden");
      $("#active-2 nav").addClass("hidden");
      ui.draggable.removeClass("played");
      if ($("#active-2 .move").hasClass("not-chosen")){
        $("#active-2 .move").click();
      }
      $("#active-2 button").off("click");
    };

    var handIn = function(event, ui) {
      if ($(ui.draggable).hasClass("from-active")){
        $(ui.draggable).offset({top: $(this).offset().top});
        $(ui.draggable).removeClass("from-active");
      }
    };

    var handOut = function(event, ui) {
      $(ui.draggable).addClass("from-hand");
    };

    dropify($("#play-1"), play1In, play1Out);
    dropify($(".hand"), handIn, handOut);

    $(".confirm").on("click", function(){
      var actions = [], overheating;

      $(".played").each(function(){
        action = {};
        action.value = $(this).attr("data-info")[0];
        action.dir = $(this).attr("data-info").slice(2);

        if ($(this).hasClass("shot-down")) {
          if ($(this).hasClass("feint")) {
            action.action_type = "feint";
          } else {
            action.action_type = "move";
          }
        } else {
          action.action_type = "shot";
        }
        actions.push(action);
      })

      overheating = actions.length === 2;

      $.ajax({
        url: window.gameUrl,
        type: "PUT",
        data: {
          "actions": actions,
          "phase": "play",
          "overheating": overheating
        },
        success: function(returnData){
          clearBindings();
          refresh(returnData);
        },
        error: function(request){
          if (request.status == 422) {
            alert(JSON.parse(request.responseText).error)
          }
        }
      });
    });
  };

  var renderDiscard = function() {
    var discardedCards = 0;
    var toDiscard = function(){
      if (player.outward_hand.length < 4) {
        return 0;
      } else {
        return $(".hand .card").length - 3 - discardedCards;
      }
    }

    bindCards(".hand", 0);

    $(".undo").on("click", function(){
      resetCards();
      discardedCards = 0;
      $(".moved-count").html("Cards to discard: " + toDiscard());
      canConfirm();
    })

    var canConfirm = function() {
      if ($(".hand .card").length <= 3 && discardedCards === 0 ||
          $(".hand .card").length- discardedCards === 3) {
        $("button.confirm").removeAttr("disabled");
      } else {
        $("button.confirm").attr("disabled", "disabled");
      }
    };

    canConfirm();

    $(".moved-count").html("Cards to discard: " + toDiscard());

    var handIn = function(event, ui) {
      $(ui.draggable).offset({top: $(this).offset().top});
      if ($(ui.draggable).hasClass("from-discard")){
        discardedCards -= 1;
        $(".moved-count").html("Cards to discard: " + toDiscard());
        if (discardedCards === 0) {
          $("button.undo").attr("disabled", "disabled");
        }
        canConfirm();
        $(ui.draggable).removeClass("from-discard");
        $(ui.draggable).removeClass("discarded");
      }
    }

    var handOut = function(event, ui) {
      $(ui.draggable).addClass("from-hand");
    };

    var discardIn = function(event, ui) {
      $(ui.draggable).offset($(this).offset());
      if ($(ui.draggable).hasClass("from-hand")){
        discardedCards += 1;
        $(".moved-count").html("Cards to discard: " + toDiscard());
        canConfirm();
        $("button.undo").removeAttr("disabled");
        $(ui.draggable).removeClass("from-hand");
        $(ui.draggable).addClass("discarded");
      }
    };

    var discardOut = function(event, ui) {
      $(ui.draggable).addClass("from-discard");
    };

    dropify($(".discard"), discardIn, discardOut);
    dropify($(".hand"), handIn, handOut);

    $(".confirm").on("click", function(){
      var discards = [];
      $(".discarded").each(function(){
        card = {};
        card.value = $(this).attr("data-info")[0];
        card.dir = $(this).attr("data-info").slice(2);
        discards.push(card);
      });

      $.ajax({
        url: window.gameUrl,
        type: "PUT",
        data: {
          "phase": "discard",
          "discarded_cards": discards
        },
        success: function(returnData){
          clearBindings();
          refresh(returnData);
        }
      });
    });
  };

  var renderOver = function() {
    $(".game-over").removeClass("gone");
    $(".active").addClass("gone");
    resultsDisplay();
  };

  return {
    init: init
  };
})();
// Place all the behaviors and hooks related to the matching controller here.
// All this logic will automatically be available in application.js.
var Game = (function(){
  var bindCards = function(zone, index){
    $(".hand .card").on("click", function(){

      if ($(this).hasClass('noclick')) {
        $(this).removeClass('noclick');
      } else {
        $(this).toggleClass("shot-down")
      }
    })

    $(zone + " .card").slice(index).draggable({
      snap: ".slot",
      snapMode: "inner",
      cursor: "move",
      revert: "invalid",
      stack: ".card",
      start: function(event, ui) {$(this).addClass('noclick')},
    })

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
    $("button.flow").attr("disabled", "disabled")

    setTimeout(function(){
      $(".card").css({"-webkit-transition-property": "-webkit-transform"})
    }, 250)
  };

  var dropify = function($el, dropHandler, outHandler) {
    $el.addClass("phased slot")
    $el.droppable({
      drop: dropHandler,
      out: outHandler
    })
  }

  var init = function(phase) {
    switch(phase) {
    case "draw":
      phaseDraw();
      break;
    case "play":
      phasePlay();
      break;
    case "discard":
      phaseDiscard();
      break;
    case "game_over":
      gameOver();
    }
    if($("h3").hasClass("ready")){
      setRefreshTimer();
      freezeAll();
    }
  }

  var setRefreshTimer = function() {
    setTimeout(function(){
       window.location.reload(1);
    }, 5000);
  }

  var freezeAll = function() {
    $("button.flow").attr("disabled", "disabled")
    $(".ui-draggable").draggable("destroy")
  }

  var phaseDraw = function() {
    var drawnCards = 0;
    var overheating = false;
    bindCards(".deck", -3);
    $(".undo").on("click", function(){
      resetCards();
      drawnCards = 0;
      $(".main-cards strong").html("Cards to draw: " + drawnCards);
    })

    $(".main-cards").append("<strong>Cards to draw: 0</strong>")

    var drawWarning = function(){
      var $one = $("#" + playerColor + "-1"),
          $two = $("#" + playerColor + "-2")
      switch(drawnCards) {
      case 1:
        $(".warning").addClass("hidden");
        break;
      case 2:
        if ($one.html()) {
          $(".warning").removeClass("hidden")
          overheating = {fake: false}

          if ($one.find("img").css("opacity") == "0.5") {
            $(".warning").addClass("fake")
            overheating = {fake: true}
          }
        } else {
          $(".warning").addClass("hidden");
          overheating = false
        }
        break;
      case 3:
        if ($one.html() || $two.html()) {
          $(".warning").removeClass("hidden")

          if (($one.find("img").length == 0 ||
               $one.find("img").css("opacity") == "0.5") &&
              ($two.find("img").length == 0 ||
               $two.find("img").css("opacity") == "0.5")){
            $(".warning").addClass("fake")
            overheating = {fake: true}
          } else {
            $(".warning").removeClass("fake")
            overheating = {fake: false}
          }
        }
      }
    }

    var handIn = function(event, ui) {
      if ($(ui.draggable).hasClass("from-deck")){
        drawnCards += 1;
        $(".main-cards strong").html("Cards to draw: " + drawnCards)
        if (drawnCards === 1) {
          $("button.flow").removeAttr("disabled")
        } else drawWarning()

        $(ui.draggable).removeClass("from-deck")
      }
    }

    var handOut = function(event, ui) {
      $(ui.draggable).addClass("from-hand")
    }

    var deckIn = function(event, ui) {
      if ($(ui.draggable).hasClass("from-hand")){
        drawnCards -= 1;
        $(".main-cards strong").html("Cards to draw: " + drawnCards)
        if (drawnCards === 0) {
          $("button.flow").attr("disabled", "disabled")
        } else drawWarning()
        $(ui.draggable).removeClass("from-hand")
      }
    }

    var deckOut = function(event, ui) {
      $(ui.draggable).addClass("from-deck")
    }

    dropify($(".hand"), handIn, handOut)
    dropify($(".deck"), deckIn, deckOut)

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

        }
      })
    })
  }

  var phasePlay = function() {
    bindCards(".hand", 0);

    $(".undo").on("click", function(){
      resetCards();
      play1Out();
      play2Out();
    })

    var addMoveFeint = function(target, ui) {
      $(target + " nav").removeClass("hidden")
      $(target + " button").on("click", {card: ui.draggable}, swapActive)

      if (ui.draggable.attr("data-info").slice(2) == "forward"){
        $(target + " .move").addClass("up")
      } else {
        $(target + " .move").addClass("down")
      }
    }

    var swapActive = function(event) {
      if ($(event.target).hasClass("not-chosen")){
        $(event.target).siblings().addBack().toggleClass("chosen not-chosen")

        if ($(event.target).hasClass("feint")){
          event.data.card.addClass("feint")
        } else {
          event.data.card.removeClass("feint")
        }
      }
    }

    var play1In = function(event, ui) {
      dropify($("#play-2"), play2In, play2Out)
      $("button.flow").removeAttr("disabled")
      ui.draggable.addClass("played")
      if (ui.draggable.hasClass("shot-down")){
        addMoveFeint("#active-1", ui)
      }
    }

    var play1Out = function(event, ui) {

      $("button.flow").attr("disabled", "disabled")
      $("#active-1 nav").addClass("hidden")

      if ($("#active-1 .move").hasClass("not-chosen")){
        $("#active-1 .move").click()
      }
      $("#active-1 button").off("click")
      $(".played").removeClass("played")

      if ($("#play-2").hasClass("ui-droppable")){
        $("#play-2").removeClass("phased slot")
        $("#play-2").droppable('destroy')
        play2Out(event, ui)
      }
    }

    var play2In = function(event, ui) {
      $(".warning").removeClass("hidden")
      ui.draggable.addClass("played")

      if (ui.draggable.hasClass("shot-down")){
        addMoveFeint("#active-2", ui)
      }
    }

    var play2Out = function(event, ui) {
      $(".warning").addClass("hidden")
      $("#active-2 nav").addClass("hidden")
      ui.draggable.removeClass("played")
      if ($("#active-2 .move").hasClass("not-chosen")){
        $("#active-2 .move").click()
      }
      $("#active-2 button").off("click")
    }

    dropify($("#play-1"), play1In, play1Out)
    dropify($(".hand"))

    $(".confirm").on("click", function(){
      var actions = [], overheating

      $(".played").each(function(){
        action = {}
        action.value = $(this).attr("data-info")[0]
        action.dir = $(this).attr("data-info").slice(2)

        if ($(this).hasClass("shot-down")) {
          if ($(this).hasClass("feint")) {
            action.action_type = "feint"
          } else {
            action.action_type = "move"
          }
        } else {
          action.action_type = "shot"
        }
        actions.push(action)
      })

      overheating = actions.length === 2

      $.ajax({
        url: window.gameUrl,
        type: "PUT",
        data: {
          "actions": actions,
          "phase": "play",
          "overheating": overheating
        },
        success: function(returnData){

        }
      })
    })
  }

  var phaseDiscard = function() {
    var discardedCards = 0;

    bindCards(".hand", 0);

    $(".undo").on("click", function(){
      resetCards();
      discardedCards = 0;
      $(".main-cards strong").html("Cards to discard: " + discardedCards);
      canConfirm()
    })

    var canConfirm = function() {
      if ($(".hand .card").length <= 3 && discardedCards === 0 ||
          $(".hand .card").length- discardedCards === 3) {
        $("button.confirm").removeAttr("disabled")
      } else {
        $("button.confirm").attr("disabled", "disabled")
      }
    }

    canConfirm()

    $(".main-cards").append("<strong>Cards to discard: 0</strong>")

    var handIn = function(event, ui) {
      if ($(ui.draggable).hasClass("from-discard")){
        discardedCards -= 1;
        $(".main-cards strong").html("Cards to discard: " + discardedCards)
        if (discardedCards === 0) {
          $("button.undo").attr("disabled", "disabled")
        }
        canConfirm()
        $(ui.draggable).removeClass("from-discard")
        $(ui.draggable).removeClass("discarded")
      }
    }

    var handOut = function(event, ui) {
      $(ui.draggable).addClass("from-hand")
    }

    var discardIn = function(event, ui) {
      if ($(ui.draggable).hasClass("from-hand")){
        discardedCards += 1;
        $(".main-cards strong").html("Cards to discard: " + discardedCards)
        canConfirm()
        $("button.undo").removeAttr("disabled")
        $(ui.draggable).removeClass("from-hand")
        $(ui.draggable).addClass("discarded")
      }
    }

    var discardOut = function(event, ui) {
      $(ui.draggable).addClass("from-discard")
    }

    dropify($(".discard"), discardIn, discardOut)
    dropify($(".hand"), handIn, handOut)

    $(".confirm").on("click", function(){
      var discards = []
      $(".discarded").each(function(){
        card = {}
        card.value = $(this).attr("data-info")[0]
        card.dir = $(this).attr("data-info").slice(2)
        discards.push(card)
      })

      console.log(discards)

      $.ajax({
        url: window.gameUrl,
        type: "PUT",
        data: {
          "phase": "discard",
          "discarded_cards": discards
        },
        success: function(returnData){

        }
      })
    })
  }

  var gameOver = function() {
    $(".game-over").removeClass("hidden")
  }

  return {
    init: init,
  };
})();
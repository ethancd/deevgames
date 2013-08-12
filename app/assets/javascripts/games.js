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

  var activate = function(phase) {
    switch(phase) {
    case "draw":
      phaseDraw();
      break;
    case "play":
      phasePlay();
      break;
    case "move":
      resolveMoves();
      break;
    case "shoot":
      resolveShots();
      break;
    case "end?":
      checkEnd();
      break;
    case "discard":
      phaseDiscard();
      break;
    case "game_over":
      gameOver();
      break;
    }
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

          if (($one.find("img") === undefined ||
               $one.find("img").css("opacity") == "0.5") &&
              ($two.find("img") === undefined ||
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
      console.log(overheating)
      $.ajax({
        url: window.gameUrl,
        type: "PUT",
        data: {
          "drawn_cards": drawnCards,
          "phase": "play",
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
      $(target + " button").on("click", swapActive)

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
          $(event.target).parent().siblings().css("opacity", 0.5)
        } else {
          $(event.target).parent().siblings().css("opacity", 1.0)
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

    var play1Out = function() {
      $("button.flow").attr("disabled", "disabled")
      $("#active-1 nav").addClass("hidden")
      if ($("#active-1 .move").hasClass("not-chosen")){
        $("#active-1 .move").click()
      }
      $(".played").removeClass("played")

      if ($("#play-2").hasClass("ui-droppable")){
        $("#play-2").removeClass("phased slot")
        $("#play-2").droppable('destroy')
        play2Out()
      }
    }

    var play2In = function(event, ui) {
      $(".warning").removeClass("hidden")
      ui.draggable.addClass("played")

      if (ui.draggable.hasClass("shot-down")){
        addMoveFeint("#active-2", ui)
      }
    }

    var play2Out = function() {
      $(".warning").addClass("hidden")
      $("#active-2 nav").addClass("hidden")
      ui.draggable.removeClass("played")
      if ($("#active-2 .move").hasClass("not-chosen")){
        $("#active-2 .move").click()
      }
    }

    dropify($("#play-1"), play1In, play1Out)
    dropify($(".hand"))
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
  }

  return {
    activate: activate,
  };
})();
require "debugger"
class Njt::GamesController < ApplicationController
  include GamesHelper

  before_filter :auth_only!

  def create
    @game = Game.create(phase: "play")
    @game.players << Player.create(user_id: current_user.id)
    @game.players << Player.create(user_id: 2, ready: true) if params[:ai]
    @game.save
    if @game.players.count == 1
      redirect_to njt_game_pregame_url(@game)
    else
      @game.setup_game

      if @game.save
        redirect_to njt_game_url(@game.id)
      else
        flash[:notice] ||= []
        flash[:notice] << @game.errors.full_messages
        redirect_to :root
      end
    end
  end

  def enqueue
    @queue = Game.find_by_queue(true)

    if @queue.nil?
      @queue = Game.create(phase: "play", queue: true)
      @queue.players << Player.create(user_id: current_user.id)
      flash[:notice] ||= []
      flash[:notice] << "Waiting for another player..."
      redirect_to njt_game_pregame_url(@queue)
    elsif @queue.players.count > 1
      @queue.update_attributes(queue: false)
      enqueue
    elsif @queue.players.first.user == current_user
      flash[:notice] ||= []
      flash[:notice] << "Waiting for another player..."
      redirect_to njt_game_pregame_url(@queue)
    else
      @queue.players << Player.create(user_id: current_user.id)
      @queue.setup_game
      @queue.save
      @queue.update_attributes(queue: false)
      redirect_to njt_game_url(@queue)
    end
  end

  def pregame
    @game = Game.find(params[:game_id])
  end

  def show
    @game = Game.find(params[:id])
    @white = @game.players[0]

    if @game.players.count == 1
      if current_user == @white.user
        flash[:notice] ||= []
        flash[:notice] << "Waiting for another player..."
        redirect_to njt_game_pregame_url(@game)
        return
      else
        @game.players << Player.create(user_id: current_user.id)
        @game.setup_game
        @game.save
      end
    end

    @black = @game.players[1]

    if current_user == @white.user
      @player = @white
    elsif current_user == @black.user
      @player = @black
    end

    @color = @player == @white ? "white" : "black"
    @discards = @game.cards.where(location: "discard")
    @deck = @game.cards.where(location: ["deck", "drawn"])

    if @player.nil?
      flash[:notice] ||= []
      flash[:notice] << "Spectating is currently disabled."
      redirect_to njt_splash_url
      return
    end
  end

  def update
    @game = Game.find(params[:id])
    @player = @game.players.find_by_user_id(current_user.id)

    unless @player.ready
      case params[:phase]
      when "draw"
        @player.drawify(params[:drawn_cards])
        @ai.ai_draw if ai?
        @player.update_attributes(ready: true)
      when "play"
        if @player.play(params)
          @ai.ai_play if ai?
          @player.update_attributes(ready: true)
        end
      when "discard"
        @player.trashify(params[:discarded_cards])
        @ai.ai_discard if ai?
        @player.update_attributes(ready: true)
      end
    end

    if @game.players(reload: true).all?{|p| p.ready}
      @game.players.each_with_index do |player, play_resolved|
        player.update_attributes(ready: false)

        case params[:phase]
        when "draw"
          drawn = player.cards.where(location: "drawn")
          player.draw(drawn)
          @game.phase = "play"
          if player.legal_plays.empty?
            @game.harm(10, player, false)
            @game.game_over(current_user)
          end
        when "play"
          next if play_resolved == 1
          @game.resolve_all_actions
          if @game.players.any?{ |player| player.damage >= 9 }
            @game.game_over(current_user)
          else
            @game.phase = "discard"
          end
        when "discard"
          trashed = player.cards.where(location: "trashed")
          player.discard(trashed)
          @game.phase = "draw"
        end
      end

      @ai.update_attributes(ready: true) if ai?
      @game.save

      show #fix this so it returns something sensible to ajax calls
      render :show
    else
      flash[:notice] ||= []
      flash[:notice] << "Waiting for opponent"
      show
      render :show
    end
  end

  def destroy
    @game = Game.find(params[:id])
    @game.game_over(current_user)

    if @game.result == "quit"
      flash[:notice] ||= []
      flash[:notice] << "You have quit the game"
      redirect_to njt_splash_url
    else
      redirect_to njt_game_url(@game)
    end
  end

  private
    def auth_only!
      unless user_signed_in?
        flash[:notice] ||= []
        flash[:notice] << "Must be signed in to play (if you don't have " +
                          "an account, try signing in as a guest!)"
        redirect_to :out
      end
    end

    def ai?
      if @game.players.last.user_id == 2
        @human, @ai = @game.players
      else
        false
      end
    end

end
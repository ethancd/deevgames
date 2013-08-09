class Njt::GamesController < ApplicationController

  def new
    @game = Game.new
  end

  def create
    @game = Game.create(phase: "play")
    @game.players << Player.create(user_id: current_user.id)
    @game.setup_game(params[:ai])

    if @game.save
      redirect_to njt_game_url(@game.id)
    else
      flash[:notice] ||= []
      flash[:notice] << @game.errors.full_messages
      redirect_to :root
    end
  end

  def show
    @game = Game.find(params[:id])
    @white = @game.players.first
    @black = @game.players.last
    @player = current_user == @white.user ? @white : @black
    @color = @player == @white ? "white" : "black"
    @discards = @game.cards.where(location: "discard")
    @deck = @game.cards.where(location: "deck")
  end

  def update
  end

end
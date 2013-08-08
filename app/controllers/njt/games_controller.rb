class Njt::GamesController < ApplicationController

  def new
    @game = Game.new
  end

  def create
    @game = Game.new(params[:game])

    if @game.save
      redirect_to @game
    else
      render :new
    end
  end

  def show
    @game = Game.find(params[:id])
    @white = Game.players.first
    @black = Game.players.last
    @player = current_user == @white.user ? @white : @black
  end

  def update
  end

end
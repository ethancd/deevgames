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
    @game = Game.find(params[:id])
    @player = @game.players.find_by_user_id(current_user.id)

    case params[:phase]
    when "draw"
      draw(params)
      @game.phase = "play"
    when "play"
      play(params)

      if @game.players.any?{ |player| player.damage >= 9 }
        @game.phase = "game_over"
      else
        @game.phase = "discard"
      end

    when "discard"
      discard(params[:discarded_cards]) if params[:discarded_cards]
      @game.phase = "draw"
    end

    @game.save

    show
    render :show
  end


  private
    def draw(params)
      @game.deal(params[:drawn_cards], @player)
      if params[:overheating] != "false"
        @game.harm(2, @player, params[:overheating][:fake])
      end
    end

    def play(params)
      if params[:overheating] != "false"
        @game.harm(2, @player, false)
      end
      discard(params[:actions])
    end

    def discard(discards)
      discards.each do |discard|
        card = @player.cards.find_by_value_and_dir(discard[1]["value"].to_i, discard[1]["dir"])
        card.player_id = nil
        card.location = "discard"
        card.save!
      end
    end
end
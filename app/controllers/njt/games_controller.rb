class Njt::GamesController < ApplicationController
  include GamesHelper

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
      ai_draw if ai?
      @game.phase = "play"
    when "play"
      if play(params)
        ai_play if ai?
        if @game.players.any?{ |player| player.damage >= 9 }
          @game.phase = "game_over"
        else
          @game.phase = "discard"
        end
      end

    when "discard"
      discard(params[:discarded_cards], @player) if params[:discarded_cards]
      ai_discard if ai?
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
      paper_tanks = @player.tanks.map do |tank|
        {position: tank.position, fake: tank.fake}
      end

      @actions = params[:actions].map{ |action| action[1] }
      loop_over(paper_tanks)

      if @actions.empty?
        actions = params[:actions].map{ |action| action[1] }
        2.times do |i|
          finished_actions = []
          actions.each do |action|
            next if i == 0 && action["type"] == "shot"
            resolve(action, @player.tanks)
            finished_actions << action
          end
          actions -= finished_actions
        end

        @game.harm(2, @player, false) unless params[:overheating] == "false"
        discard(params[:actions], @player)
        true
      else
        #raise errors
        false
      end
    end

    def discard(discards, player)
      discards.each do |discard|
        card = player.cards.find_by_value_and_dir(
          discard[1]["value"].to_i, discard[1]["dir"])
        card.player_id = nil
        card.location = "discard"
        card.save!
      end
    end
end
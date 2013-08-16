class Njt::GamesController < ApplicationController
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

    if current_user == @game.users[0]
      @player, @color = @game.players[0], "white"
    elsif current_user == @game.users[1]
      @player, @color = @game.players[1], "black"
    end

    if @game.players.count == 1
      if @player
        flash[:notice] ||= []
        flash[:notice] << "Waiting for another player..."
      else
        flash[:notice] ||= []
        flash[:notice] << "Want to play in this game? Click the 'Join' button!"
      end
      redirect_to njt_game_pregame_url(@game)
    else
      respond_to do |format|
        format.html
        format.json { render json: @game, root: false }
      end
    end
  end

  def update
    @game = Game.find(params[:id])
    player = @game.players.find_by_user_id(current_user.id)

    unless player.ready
      if player.step_forward(params)
        player.update_attributes(ready: true)
        @ai.update_attributes(ready: true) if ai?
      end
    end

    if @game.players(reload: true).all?{|p| p.ready}
      @game.players.each_with_index do |player, resolved|
        player.update_attributes(ready: false)

        case params[:phase]
        when "draw"
          drawn = player.cards.where(location: "drawn")
          player == ai? ? @ai.ai_draw : player.draw(drawn)
        when "play"
          next if resolved == 1
          @ai.ai_play if ai?
          @game.resolve_all_actions
        when "discard"
          trashed = player.cards.where(location: "trashed")
          player == ai? ? @ai.ai_discard : player.discard(trashed)
        end
      end

      @game.advance_phase(params)
      @game.save
    end

    render json: @game, root: false
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
        @ai = @game.players.last
      else
        false
      end
    end

end
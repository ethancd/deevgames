require "debugger"
  # def advance_phase(next_phase)
  #   @current_user == @game.p1 ? @game.p1_done = true : @game.p2_done = true
  #
  #   if next_phase == "discard" || next_phase == "game_over"
  #     @game.p1_done = true
  #     @game.p2_done = true
  #   end
  #
  #   @game.save
  #
  #   if @game.p1_done && @game.p2_done
  #     @game.phase = next_phase
  #     @game.p1_done = @game.p2_done = false
  #     @game.save
  #
  #     if next_phase == "resolution"
  #       resolve(@game, self)
  #     else
  #       redirect_to @game
  #     end
  #   else
  #     flash[:notices] ||= []
  #     flash[:notices] << "Waiting for opponent"
  #     redirect_to @game
  #   end
  # end

module GamesHelper
  LEGAL_SHOTS = {1 => [3], 2 => [2,3], 3 => [1,2,3] }

  # def resolve(game, controller)
  #   players = game.players
  #
  #   players.each do |player|
  #     actions = player.tank.actions
  #     actions.each do |action|
  #       if action.direction
  #         resolve_move(action, player.tank)
  #         action.destroy
  #       end
  #     end
  #   end
  #
  #   players.each do |player|
  #     player.tank.actions.each do |action|
  #       resolve_shot(action, player.tank)
  #       action.destroy
  #     end
  #   end
  #
  # end

  def loop_over(paper_tanks)
    loop_over_shots(loop_over_moves(loop_over_moves(paper_tanks)))
  end

  def loop_over_moves(paper_tanks)
    @actions.each do |action|
      next if action["type"] == "shot"

      if valid?(action, paper_tanks)
        paper_tanks = trial_move(action, paper_tanks)
        @actions.delete(action)
      end
    end

    paper_tanks
  end

  def loop_over_shots(paper_tanks)
    @actions.each do |action|
      next unless action["type"] == "shot"

      if valid?(action, paper_tanks)
        @actions.delete(action)
      end
    end
  end

  def resolve(action, tanks)
    if action["type"] == "shot"
      resolve_shot(action)
    else
      if tanks.first.class == Hash
        trial_move(action, tanks)
      else
        resolve_move(action)
      end
    end
  end

  def trial_move(action, paper_tanks)
    debugger
    dx = action["dir"] == "forward" ? 1 : -1
    temp_tanks = []

    paper_tanks.each do |tank|
      unless [0,4].include?(tank[:position] + dx)
        t = {position: tank[:position] + dx, fake: true}
        if action["type"] == "move" && !tank[:fake]
          t[:fake] = false
          tank[:fake] = true
        end
        temp_tanks << t
      end
      temp_tanks << tank
    end

    temp_tanks
  end

  def resolve_move(action)
    dx = action["dir"] == "forward" ? 1 : -1
    temp_tanks = []

    @player.tanks.each do |tank|
      unless [0,4].include?(tank.position + dx)
        t = Tank.new(player_id: @player.id, game_id: @game.id,
                     position: tank.position + dx)
        if action["type"] == "move" && !tank.fake
          t.fake = false
          tank.fake = true
        else
          t.fake = true
        end
        t.save
        temp_tanks << t
      end
      tank.save
      temp_tanks << tank
    end

    @player.tanks = temp_tanks

    unless @player.tanks.pluck(:position).uniq.count == @player.tanks.count
      needed_tanks = []
      @player.tanks.pluck(:position).uniq.each do |pos|
        real = @player.tanks.find_by_position_and_fake(pos, false)
        if real.nil?
          needed_tanks << @player.tanks.find_by_position(pos)
        else
          needed_tanks << real
        end
      end

      @player.tanks = needed_tanks
    end
    @player.tanks.map(&:save)
  end

  def resolve_shot(action)
    @enemy = @player == @game.players.first ? @game.players.last : @game.players.first

    not_spots = [1,2,3] - LEGAL_SHOTS[action[:value].to_i]
    @player.tanks.where(position: not_spots).map(&:destroy)

    if @enemy.tanks.find_by_position_and_fake(action[:value], false)
      @game.harm(3, @enemy, false)

      @enemy.tanks = [@enemy.tanks.create(game_id: @game.id,
        position: action[:value].to_i, fake: false)]
    else
      target = @enemy.tanks.find_by_position(action[:value])
      target.destroy unless target.nil?
    end
  end

  def valid?(action, paper_tanks)
    case action["type"]
    when "shot" then valid_shot?(action, paper_tanks)
    when "move" then valid_move?(action, paper_tanks)
    when "feint" then valid_feint?(action, paper_tanks)
    end
  end

  def valid_shot?(action, paper_tanks)
    if LEGAL_SHOTS[action["value"].to_i].include?(paper_tanks.find{|t| !t[:fake] }[:position])
      true
    else
      flash[:notices] ||= []
      flash[:notices] << "That shot is out of range."
      false
    end
  end

  def valid_move?(action, paper_tanks)
    if action["dir"] == "forward" && paper_tanks.find{|t| !t[:fake] && [:position] == 3}
      flash[:notices] ||= []
      flash[:notices] << "Can't move further up."
      false
    elsif action["dir"] == "back" && paper_tanks.find{|t| !t[:fake] && [:position] == 1}
      flash[:notices] ||= []
      flash[:notices] << "Can't move further back."
      false
    else
      true
    end
  end

  def valid_feint?(action, paper_tanks)
    if action["dir"] == "forward" && paper_tanks.min_by{|t| t[:position]} == 3
      flash[:notices] ||= []
      flash[:notices] << "Can't pretend to move further up."
      false
    elsif action["dir"] == "back" && paper_tanks.max_by{|t| t[:position]} == 1
      flash[:notices] ||= []
      flash[:notices] << "Can't pretend to move further back."
      false
    else
      true
    end
  end
end

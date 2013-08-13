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

  def resolve_all_actions
    players = @game.players

    overheat(players)
    move(players)
    shoot(players)
  end

  def overheat(players)
    players.each do |player|
      if player.cards.where(location: "action").count == 2
        @game.harm(2, player, false)
      end
    end
  end


  def move(players)
    players.each do |player|
      player.cards.where(location: "action").each do |action|
        if action.action_type == "feint" || action.action_type == "move"
          p "*********************************************"
          p action
          p "**********************************************"
          resolve_move(action, player)
          action.player_id = nil
          action.location = "discard"
          action.save
        end
      end
    end
  end

  def shoot(players)
    players.each do |player|
      player.cards.where(location: "action").each do |action|
        p "*********************************************"
        p action
        p "**********************************************"
        resolve_shot(action, player)
        action.player_id = nil
        action.location = "discard"
        action.save
      end
    end
  end

  def ai?
    if @game.players.last.user_id == 2
      @human, @ai = @game.players
    else
      false
    end
  end

  def ai_draw
    if @ai.tanks.count == 1
      @game.deal(@ai.tanks.first.position, @ai)
    else
      real = @ai.tanks.find_by_fake(false).position
      fakes = @ai.tanks.where(fake: true).pluck(:position)
      drawn = rand < 0.5 ? real : fakes.sample
      @game.deal(drawn, @ai)

      @game.harm(2, @ai, drawn <= real) if drawn > fakes.min
    end
  end

  def ai_play
    # legal = false
    # if rand < 0.7 || @ai.cards.count == 1
        active_cards([pick_ai_action(legal_plays)], @ai)
        # legal = !!actions[0]
      # end
    # else
#       until legal
#         paper_tanks = @ai.tanks.map do |tank|
#           {position: tank.position, fake: tank.fake}
#         end
#
#         @actions = []
#         2.times{ @actions << pick_ai_action(legal_plays) }
#         actions = @actions.dup
#         next if @actions.map{|a| a["id"]}.uniq.count == 1
#
#         loop_over(paper_tanks)
#         legal = @actions.empty?
#       end
#     end
  end

  def legal_plays
    plays = []
    paper_tanks = @ai.tanks.map do |tank|
      {position: tank.position, fake: tank.fake}
    end

    @ai.cards.each_with_index do |card, i|
      if valid?({"value"=> card.value, "dir"=> card.dir, "action_type" => "shot"}, paper_tanks)
        plays << {"value" => card.value, "dir" => card.dir, "action_type" => "shot", "id" => i}
      end
      if valid?({"value"=> card.value, "dir"=> card.dir, "action_type"=> "move"}, paper_tanks)
        plays << {"value" => card.value, "dir" => card.dir, "action_type" => "move", "id" => i}
        plays << {"value" => card.value, "dir" => card.dir, "action_type" => "feint", "id" => i}
      end
    end

    plays
  end

  def pick_ai_action(plays)
    shots = plays.select{|p| p["action_type"] == "shot"}
    if shots.count > 0 && rand < 0.6
      action = shots.sample
    else
      action = (plays - shots).sample
      rand < 0.8 ? action["action_type"] = "move" : action["action_type"] = "feint"
    end
    action
  end

  def ai_discard
    discard(@ai.cards.shuffle[3..-1], @ai) if @ai.cards.count > 3
  end

  def loop_over(paper_tanks)
    loop_over_shots(loop_over_moves(loop_over_moves(paper_tanks)))
  end

  def loop_over_moves(paper_tanks)
    finished_actions = []
    @actions.each do |action|
      next if action["action_type"] == "shot"
      if valid?(action, paper_tanks)
        paper_tanks = trial_move(action, paper_tanks)
        finished_actions << action
      end
    end
    @actions -= finished_actions
    paper_tanks
  end

  def loop_over_shots(paper_tanks)
    finished_actions = []
    @actions.each do |action|
      next unless action["action_type"] == "shot"

      if valid?(action, paper_tanks)
        finished_actions << action
      end
    end
    @actions -= finished_actions
  end

  def resolve(action, tanks)
    if action["action_type"] == "shot"
      resolve_shot(action, tanks.first.player)
    else
      if tanks.first.class == Hash
        trial_move(action, tanks)
      else
        resolve_move(action, tanks.first.player)
      end
    end
  end

  def trial_move(action, paper_tanks)
    dx = action["dir"] == "forward" ? 1 : -1
    temp_tanks = []

    paper_tanks.each do |tank|
      unless [0,4].include?(tank[:position] + dx)
        t = {position: tank[:position] + dx, fake: true}
        if action["action_type"] == "move" && !tank[:fake]
          t[:fake] = false
          tank[:fake] = true
        end
        temp_tanks << t
      end
      temp_tanks << tank
    end

    temp_tanks
  end

  def resolve_move(action, player)
    dx = action["dir"] == "forward" ? 1 : -1
    temp_tanks = []

    player.tanks.each do |tank|
      unless [0,4].include?(tank.position + dx)
        t = Tank.new(player_id: player.id, game_id: @game.id,
                     position: tank.position + dx)
        if action["action_type"] == "move" && !tank.fake
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

    player.tanks = temp_tanks

    unless player.tanks.pluck(:position).uniq.count == player.tanks.count
      needed_tanks = []
      player.tanks.pluck(:position).uniq.each do |pos|
        real = player.tanks.find_by_position_and_fake(pos, false)
        if real.nil?
          needed_tanks << player.tanks.find_by_position(pos)
        else
          needed_tanks << real
        end
      end

      player.tanks = needed_tanks
    end
    player.tanks.map(&:save)
  end

  def resolve_shot(action, player)
    enemy = player == @game.players.first ? @game.players.last : @game.players.first

    not_spots = [1,2,3] - LEGAL_SHOTS[action[:value].to_i]
    player.tanks.where(position: not_spots).map(&:destroy)

    if enemy.tanks.find_by_position_and_fake(action[:value], false)
      @game.harm(3, enemy, false)

      enemy.tanks = [enemy.tanks.create(game_id: @game.id,
        position: action[:value].to_i, fake: false)]
    else
      target = enemy.tanks.find_by_position(action[:value])
      target.destroy unless target.nil?
    end
  end

  def valid?(action, paper_tanks)
    case action["action_type"]
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
    if action["dir"] == "forward" && paper_tanks.find{|t| !t[:fake] && t[:position] == 3}
      flash[:notices] ||= []
      flash[:notices] << "Can't move further up."
      false
    elsif action["dir"] == "back" && paper_tanks.find{|t| !t[:fake] && t[:position] == 1}
      flash[:notices] ||= []
      flash[:notices] << "Can't move further back."
      false
    else
      true
    end
  end

  def valid_feint?(action, paper_tanks)
    if action["dir"] == "forward" && paper_tanks.map{|t| t[:position]}.min == 3
      flash[:notices] ||= []
      flash[:notices] << "Can't pretend to move further up."
      false
    elsif action["dir"] == "back" && paper_tanks.map{|t| t[:position]}.max == 1
      flash[:notices] ||= []
      flash[:notices] << "Can't pretend to move further back."
      false
    else
      true
    end
  end
end

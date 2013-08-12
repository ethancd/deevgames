module GamesHelper
  LEGAL_SHOTS = {1 => [3], 2 => [2,3], 3 => [1,2,3] }

  def resolve(game, controller)
    players = game.players

    players.each do |player|
      actions = player.tank.actions
      actions.each do |action|
        if action.direction
          resolve_move(action, player.tank)
          action.destroy
        end
      end
    end

    players.each do |player|
      player.tank.actions.each do |action|
        resolve_shot(action, player.tank)
        action.destroy
      end
    end

    if game_over?
      controller.advance_phase("game_over")
    else
      controller.advance_phase("discard")
    end
  end

  def precedence_sort(actions)
    actions
  end

  def game_over?
    false
  end

  def load_game
    @game = Game.find(params[:id])
  end

  def setup(game)
    Deck.setup(game)
    Pile.setup(game)
    Tank.setup(game)
    game.phase = "play"
    game.save
  end

  def loop_over_moves(card_actions, tank)
    card_actions.each do |card_id, action_name|
      next if ["1","2","3"].include?(action_name)

      card = Card.find(card_id)
      action = Action.new(get_attrs(card, action_name))

      if valid?(action, tank)
        resolve_move(action, tank)
        card_actions.delete(card_id)
      end
    end
    card_actions
  end

  def loop_over_shots(card_actions, tank)
    card_actions.each do |card_id, action_name|
      next if ["up", "down", "feint"].include?(action_name)

      card = Card.find(card_id)
      action = Action.new(get_attrs(card, action_name))

      if valid?(action, tank)
        card_actions.delete(card_id)
      end
    end
    card_actions
  end

  def resolve_move(action, tank)
    dx = action.direction == "up" ? 1 : -1

    tank.potentials.create(position: tank.actual + dx)
    tank.actual += dx unless action.feint
    tank.save
  end

  def resolve_shot(action, tank)
    @opponent = @current_user == @game.p1 ? @game.p2 : @game.p1

    not_spots = [1,2,3] - LEGAL_SHOTS[action.value]
    not_posses = tank.potentials.where(position: not_spots)
    tank.potentials.delete(not_posses)

    if @opponent.tank.actual == action.value
      @opponent.tank.potentials = @opponent.tank.potentials.build(position: action.value)
      @game.pile.give_shot(@opponent)
    else
      misses = @opponent.tank.potentials.where(position: action.value)
      @opponent.tank.potentials.delete(misses)
    end
  end

  def get_attrs(card, action_name)
    if action_name == "feint"
      {feint: true, direction: card.direction}
    elsif ["up", "down"].include?(action_name)
      {feint: false, direction: action_name}
    elsif ["1","2","3"].include?(action_name)
      {value: action_name}
    end
  end

  def valid?(action, tank)
    valid_shot?(action, tank) if action.value
    valid_move?(action, tank) if action.direction
  end

  def valid_shot?(action, tank)
    if LEGAL_SHOTS[action.value].include?(tank.actual)
      true
    else
      flash[:notices] ||= []
      flash[:notices] << "That shot is out of range."
      false
    end
  end

  def valid_move?(action, tank)
    return valid_feint?(action, tank) if action.feint

    if action.direction == "up" && tank.actual == 3
      flash[:notices] ||= []
      flash[:notices] << "Can't move further up."
      false
    elsif action.direction == "back" && tank.actual == 1
      flash[:notices] ||= []
      flash[:notices] << "Can't move further back."
      false
    elsif !(["up", "back"].include?(action.direction))
      flash[:notices] ||= []
      flash[:notices] << "Move must be up or back."
      false
    else
      true
    end
  end

  def valid_feint?(action, tank)
    if action.direction == "up" && tank.potentials.min_by(&:position) == 3
      flash[:notices] ||= []
      flash[:notices] << "Can't pretend to move further up."
      false
    elsif action.direction == "back" && tank.potentials.max_by(&:position) == 1
      flash[:notices] ||= []
      flash[:notices] << "Can't pretend to move further back."
      false
    elsif !(["up", "back"].include?(action.direction))
      flash[:notices] ||= []
      flash[:notices] << "Move must be up or back."
      false
    else
      true
    end
  end
end

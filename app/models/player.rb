class Player < ActiveRecord::Base
  include ActionView::Helpers::TextHelper

  LEGAL_SHOTS = {1 => [3], 2 => [2,3], 3 => [1,2,3] }
  attr_accessible :game_id, :user_id, :ready

  belongs_to :game
  belongs_to :user

  has_many :tanks, dependent: :destroy
  has_many :cards, dependent: :destroy
  has_many :damage_tokens, dependent: :destroy

  validates :game, :user, presence: true

  def damage
    self.damage_tokens.where(fake: false).pluck(:value).inject(:+) || 0
  end

  def destroyed?
    self.damage >= 6
  end

  def step_forward(params)
    case params[:phase]
    when "draw" then drawify(params[:drawn_cards])
    when "play" then play(params)
    when "discard" then trashify(params[:discarded_cards])
    end
    true
  end

  def draw(drawn)

    real = self.tanks.find_by_fake(false).position
    minimum = self.tanks.pluck(:position).min
    count = drawn.count
    drawn.each do |card|
      card.update_attributes(location: "hand")
    end

    report = "#{self.user.username} draws #{pluralize(count, "card")}"
    if count > minimum
      self.game.harm(2, self, count <= real)
      report += " and takes overheating damage... or do they?"
    else
      report += "."
    end

    self.game.write(report)
  end

  def play(params)
    paper_tanks = self.tanks.map do |tank|
      {position: tank.position, fake: tank.fake}
    end

    actions = params[:actions].map{ |action| action[1] }

    if loop_over(actions, paper_tanks).empty?
      actify(params[:actions].map{ |action| action[1] })
    end
  end

  def discard(trashed)
    self.game.write("#{self.user.username} discards "+
                    "#{pluralize(trashed.count, "card")}.")

    trashed.each do |card|
      card.player_id = nil
      card.location = "discard"
      card.save!
    end
  end

  def drawify(count)
    self.game.deal(count.to_i, self)
  end

  def trashify(discards)
    return if discards.nil?

    discards.each do |_, discard|
      card = self.cards.where(location: "hand").find_by_value_and_dir(
        discard["value"].to_i, discard["dir"])
      card.location = "trashed"
      card.save!
    end
  end

  def actify(actions)
    actions.each do |action|
      card = self.cards.where(location: "hand").find_by_value_and_dir(
        action["value"].to_i, action["dir"])
      card.location = "action"
      card.action_type = action["action_type"]
      card.save!
    end
  end

  def loop_over(actions, paper_tanks)
    @actions = actions
    loop_over_shots(loop_over_moves(loop_over_moves(paper_tanks)))
  end

  def loop_over_moves(paper_tanks)
    finished_actions = []
    @actions.each do |action|
      next if action["action_type"] == "shot"
      if valid_action?(action, paper_tanks)
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

      if valid_action?(action, paper_tanks)
        finished_actions << action
      end
    end
    @actions -= finished_actions
    @actions
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

  def valid_action?(action, paper_tanks)
    case action["action_type"]
    when "shot" then valid_shot?(action, paper_tanks)
    when "move" then valid_move?(action, paper_tanks)
    when "feint" then valid_feint?(action, paper_tanks)
    end
  end

  def valid_shot?(action, paper_tanks)
    if LEGAL_SHOTS[action["value"].to_i]
      .include?(paper_tanks.find{|t| !t[:fake] }[:position])
      true
    else
      unless self.user_id == 2
        raise InvalidMove, "That shot is out of range."
      end
      false
    end
  end

  def valid_move?(action, paper_tanks)
    if action["dir"] == "forward" &&
        paper_tanks.find{|t| !t[:fake] && t[:position] == 3}
      unless self.user_id == 2
        raise InvalidMove, "Can't move further up."
      end
      false
    elsif action["dir"] == "back" && paper_tanks.find{|t| !t[:fake] &&
        t[:position] == 1}
        unless self.user_id == 2
          raise InvalidMove, "Can't move further back."
        end
      false
    else
      true
    end
  end

  def valid_feint?(action, paper_tanks)
    # if action["dir"] == "forward" && paper_tanks.map{|t| t[:position]}.min == 3
    #   unless player.user_id == 2
    #   "Can't pretend to move further up."
    #   end
    #   false
    # elsif action["dir"] == "back" &&
    #     paper_tanks.map{|t| t[:position]}.max == 1
    # "Can't pretend to move further back."
    #   false
    # else
      true
    # end
  end

  def legal_plays
    plays = []
    paper_tanks = self.tanks.map do |tank|
      {position: tank.position, fake: tank.fake}
    end

    self.cards.each_with_index do |card, i|
      ["shot", "move", "feint"].each do |action|
        if valid_action?({"value"=> card.value, "dir"=> card.dir,
            "action_type" => "#{action}"}, paper_tanks)
          plays << {"value" => card.value, "dir" => card.dir,
            "action_type" => "#{action}", "id" => i}
        end
      end
    end

    plays
  end

  def ai_draw
    if self.tanks.count == 1
      draw(drawify(self.tanks.first.position))
    else
      real = self.tanks.find_by_fake(false).position
      fakes = self.tanks.where(fake: true).pluck(:position)
      drawn = rand < 0.5 ? real : fakes.sample
      draw(drawify(drawn))
    end
  end

  def ai_play
    actify([pick_ai_action(legal_plays)])
  end

  def pick_ai_action(plays)
    shots = plays.select{|p| p["action_type"] == "shot"}
    if shots.count > 0 && rand < 0.6
      action = shots.sample
    else
      action = (plays - shots).sample
      action["action_type"] = rand < 0.8 ? "move" : "feint"
    end
    action
  end

  def ai_discard
    self.cards.count > 3 ? discard(self.cards.shuffle[3..-1]) : discard([])
  end
end

class InvalidMove < StandardError
end

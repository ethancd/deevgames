class Njt::FeedbackController < ApplicationController

  def new
    @feedback = Feedback.new(topic: "Ninja Tanks")
    render "feedback/new"
  end

end